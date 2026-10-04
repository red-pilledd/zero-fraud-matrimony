package com.thuna.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.graphics.ColorUtils
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updateLayoutParams
import com.thuna.app.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private companion object {
        /**
         * Returns the colour actually painted at the top and bottom of the viewport, as
         * `rgb(...)|rgb(...)`.
         *
         * Composites the whole hit-test stack at each point, topmost first, until it reaches an
         * opaque layer. Walking DOM ancestors instead gets the entry gate wrong: its scrim is
         * `rgba(28, 26, 40, 0.55)` over a fixed overlay, so the light page showing through is a
         * sibling, not an ancestor, and the status bar came out near-black over a grey screen.
         */
        const val EDGE_COLOR_JS = """
            (function () {
              function paint(stack) {
                var ls = [];
                for (var i = 0; i < stack.length; i++) {
                  if (!stack[i]) continue;
                  var c = window.getComputedStyle(stack[i]).backgroundColor;
                  var m = c && c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                  if (m) {
                    var a = m[4] === undefined ? 1 : parseFloat(m[4]);
                    if (a > 0) {
                      ls.push([+m[1], +m[2], +m[3], a]);
                      if (a >= 1) break;
                    }
                  }
                }
                if (!ls.length) return '';
                var base = ls[ls.length - 1];
                var r = base[0], g = base[1], b = base[2];
                for (var j = ls.length - 2; j >= 0; j--) {
                  var l = ls[j], al = l[3];
                  r = Math.round(l[0] * al + r * (1 - al));
                  g = Math.round(l[1] * al + g * (1 - al));
                  b = Math.round(l[2] * al + b * (1 - al));
                }
                return 'rgb(' + r + ', ' + g + ', ' + b + ')';
              }
              function at(x, y) { return paint(document.elementsFromPoint(x, y) || []); }
              var x = Math.floor(window.innerWidth / 2);
              // Everything transparent means nothing has been painted yet — a document still
              // loading, or about:blank. Reporting the fallback there yields `rgba(0,0,0,0)`,
              // which reads as opaque black and flashes the bars black mid-load. Say nothing
              // instead and let the shell keep the colour it has.
              var fallback = paint([document.documentElement, document.body]);
              var top = at(x, 2) || fallback;
              var bottom = at(x, window.innerHeight - 3) || top;
              if (!top) return '';
              return top + '|' + (bottom || top);
            })()
        """

        val RGB_REGEX = Regex("""(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})""")

        const val SPLASH_TIMEOUT_MS = 6000L

        /** Non-zero when the page has actually rendered something. */
        const val HAS_CONTENT_JS =
            "(document.body ? (document.body.innerText || '').trim().length + " +
                "document.body.childElementCount : 0)"
    }

    private lateinit var binding: ActivityMainBinding

    private var lastTopColor = 0
    private var lastBottomColor = 0

    /** Set once the first page has painted; the splash screen holds until then. */
    private var firstPaintDone = false

    /** A WebView permission request parked while Android asks the user for the real permission. */
    private var pendingWebPermissionRequest: PermissionRequest? = null
    private var pendingFileCallback: ValueCallback<Array<Uri>>? = null

    private val mediaPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
            val request = pendingWebPermissionRequest
            pendingWebPermissionRequest = null
            if (request != null) {
                if (results.values.all { it }) {
                    request.grant(request.resources)
                } else {
                    request.deny()
                    toast(R.string.camera_denied)
                }
            }
        }

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val data = if (result.resultCode == RESULT_OK) result.data else null
            pendingFileCallback?.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(result.resultCode, data)
            )
            pendingFileCallback = null
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        // Hold the dark splash until the page has actually painted, otherwise the WebView
        // shows an empty rectangle for the whole of a cold start on the hosting side.
        splash.setKeepOnScreenCondition { !firstPaintDone }
        // …but never indefinitely. A slow or half-dead server turns "hold until painted"
        // into a frozen logo with no progress bar and no way to retry; after this the
        // WebView takes over and its own progress bar and error screen can do their job.
        window.decorView.postDelayed({ firstPaintDone = true }, SPLASH_TIMEOUT_MS)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // targetSdk 36 is edge-to-edge with no opt-out, so without this the page would
        // run under the status bar and the gesture pill.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val sidePad = (32 * resources.displayMetrics.density).toInt()
        ViewCompat.setOnApplyWindowInsetsListener(binding.root) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            val bottom = maxOf(bars.bottom, ime.bottom)
            // The page is inset so it never runs under the bars; the scrims then fill
            // the bar areas themselves with the page's own colour.
            binding.swipeRefresh.setPadding(bars.left, bars.top, bars.right, bottom)
            binding.errorView.setPadding(bars.left + sidePad, bars.top, bars.right + sidePad, bottom)
            binding.statusScrim.updateLayoutParams { height = bars.top }
            binding.navScrim.updateLayoutParams { height = bars.bottom }
            binding.progressBar.updateLayoutParams<ViewGroup.MarginLayoutParams> {
                topMargin = bars.top
            }
            insets
        }

        setupWebView()

        binding.swipeRefresh.setOnRefreshListener {
            binding.errorView.visibility = View.GONE
            binding.webView.reload()
        }
        binding.swipeRefresh.setColorSchemeResources(R.color.accent)
        binding.swipeRefresh.setProgressBackgroundColorSchemeResource(R.color.panel)

        binding.retryButton.setOnClickListener {
            binding.errorView.visibility = View.GONE
            binding.webView.loadUrl(Config.BASE_URL)
        }

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (binding.webView.canGoBack()) {
                        binding.webView.goBack()
                    } else {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        )

        if (savedInstanceState != null) {
            binding.webView.restoreState(savedInstanceState)
        } else {
            binding.webView.loadUrl(startUrlFor(intent))
        }
    }

    /**
     * Anything that is not the site or the payment gateway leaves the WebView: tel: links (the phone number
     * shown after an approved contact exchange), upi:// and intent:// links from Razorpay (they open GPay /
     * PhonePe / Paytm), and any other website. Nothing foreign renders inside the session-holding WebView.
     */
    private fun openExternally(uri: Uri): Boolean {
        try {
            if (uri.scheme == "intent") {
                val intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME).apply {
                    addCategory(Intent.CATEGORY_BROWSABLE)
                    component = null
                    selector = null
                }
                try {
                    startActivity(intent)
                } catch (e: Exception) {
                    // the payment app isn't installed — fall back to its Play Store page if the link names one
                    intent.getStringExtra("browser_fallback_url")?.let { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(it))) }
                        ?: intent.`package`?.let { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$it"))) }
                }
            } else {
                startActivity(Intent(Intent.ACTION_VIEW, uri))
            }
        } catch (e: Exception) {
            if (uri.scheme == "upi") toast(R.string.no_upi_app)
        }
        return true
    }

    /**
     * A site link tapped elsewhere on the phone opens that page rather than the
     * home page — the manifest advertises this activity as a handler for the domain.
     */
    private fun startUrlFor(intent: Intent?): String {
        val data = intent?.data?.toString()
        return if (intent?.action == Intent.ACTION_VIEW && Config.isInternalUrl(data)) {
            data!!
        } else {
            Config.BASE_URL
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val url = startUrlFor(intent)
        if (url != Config.BASE_URL) binding.webView.loadUrl(url)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        binding.webView.saveState(outState)
    }

    private fun setupWebView() {
        val webView = binding.webView
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            // Razorpay Checkout opens its UPI / bank pages as pop-up windows
            javaScriptCanOpenWindowsAutomatically = true
            userAgentString = userAgentString + " ThunaApp/1.0"
        }

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        // The site paints its own dark palette; stop the WebView force-darkening on top of it.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            webView.settings.isAlgorithmicDarkeningAllowed = false
        }

        webView.setBackgroundColor(ContextCompat.getColor(this, R.color.bg))

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val uri = request.url
                if (Config.isInternalHost(uri.host) || Config.isPaymentHost(uri.host)) return false // keep in-app
                return openExternally(uri)
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                firstPaintDone = true
                binding.swipeRefresh.isRefreshing = false
                binding.progressBar.visibility = View.GONE
                // Write the session cookie to disk now rather than relying on WebView's lazy
                // writeback, which loses it when Android kills the process — the usual cause of
                // being logged out between launches.
                CookieManager.getInstance().flush()
                syncBarsToPage()
                checkForBlankPage(url)
            }

            /**
             * Fires on client-side route changes too, which `onPageFinished` does not —
             * and moving between the light public pages and the dark member console is
             * exactly such a change.
             */
            override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
                super.doUpdateVisitedHistory(view, url, isReload)
                syncBarsToPage()
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                super.onReceivedError(view, request, error)
                if (request.isForMainFrame) {
                    firstPaintDone = true
                    showError(R.string.offline_title, R.string.offline_message)
                }
            }

            override fun onReceivedHttpError(
                view: WebView,
                request: WebResourceRequest,
                errorResponse: WebResourceResponse
            ) {
                super.onReceivedHttpError(view, request, errorResponse)
                // Only a failed top-level document is worth replacing the page for. A 401 on a
                // fetch is the site's own gating doing its job, and a 404 on an asset must not
                // blank out a page that otherwise rendered.
                if (!request.isForMainFrame) return
                if (errorResponse.statusCode >= 500) {
                    firstPaintDone = true
                    showError(R.string.server_error_title, R.string.server_error_message)
                }
            }

            override fun onReceivedSslError(
                view: WebView,
                handler: SslErrorHandler,
                error: SslError
            ) {
                // Fail closed. A members-only session cookie is not worth a "continue anyway".
                handler.cancel()
                firstPaintDone = true
                showError(R.string.offline_title, R.string.offline_message)
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                super.onProgressChanged(view, newProgress)
                if (newProgress in 1..99) {
                    binding.progressBar.visibility = View.VISIBLE
                    binding.progressBar.progress = newProgress
                } else {
                    binding.progressBar.visibility = View.GONE
                }
            }

            /** Camera for the live selfie check. Only the site itself may ask; audio is never granted. */
            override fun onPermissionRequest(request: PermissionRequest) {
                if (!Config.isInternalUrl(request.origin?.toString())) {
                    request.deny()
                    return
                }
                val needed = mutableListOf<String>()
                if (request.resources.any { it != PermissionRequest.RESOURCE_VIDEO_CAPTURE }) {
                    request.deny()
                    return
                }
                if (request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE) &&
                    !hasPermission(Manifest.permission.CAMERA)
                ) {
                    needed.add(Manifest.permission.CAMERA)
                }
                if (needed.isEmpty()) {
                    request.grant(request.resources)
                } else {
                    pendingWebPermissionRequest = request
                    mediaPermissionLauncher.launch(needed.toTypedArray())
                }
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                super.onPermissionRequestCanceled(request)
                pendingWebPermissionRequest = null
            }

            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                // An abandoned earlier chooser must still be answered, or the page's file input
                // stays wedged waiting on a callback that never fires.
                pendingFileCallback?.onReceiveValue(null)
                pendingFileCallback = filePathCallback
                return try {
                    fileChooserLauncher.launch(fileChooserParams.createIntent())
                    true
                } catch (e: Exception) {
                    pendingFileCallback = null
                    false
                }
            }
        }
    }

    /**
     * Reads the colour the page actually paints at the top and bottom of the viewport and
     * puts it behind the status bar and the gesture pill.
     *
     * The site swaps its whole palette by redefining tokens on a wrapper `div` — light for
     * the public pages, dark for the member console — so `body` keeps reporting the dark
     * value on a page that renders cream. Sampling the painted element at each edge is
     * what actually tracks the flip, and it keeps working if the site's palette changes,
     * since nothing here hardcodes the site's colours.
     *
     * Sampled twice: once immediately, once after the frame that a route change paints,
     * because a client-side navigation reports the old colours if read too early.
     */
    /**
     * Catches a load that "succeeded" into an empty page.
     *
     * A request that returns 200 and then has its body cut short — which is what a restarting
     * host does to a streamed response — raises no error of any kind: the WebView reports the
     * page finished and simply shows nothing. Seen on this build against the live site, and
     * without this check the app just sits blank with no message and nothing to press.
     */
    private fun checkForBlankPage(url: String) {
        binding.webView.postDelayed({
            if (binding.webView.url != url) return@postDelayed
            binding.webView.evaluateJavascript(HAS_CONTENT_JS) { value ->
                if (value?.toIntOrNull() == 0 && binding.errorView.visibility != View.VISIBLE) {
                    showError(R.string.server_error_title, R.string.server_error_message)
                }
            }
        }, 1200)
    }

    private fun syncBarsToPage() {
        readPageColors()
        binding.webView.postDelayed({ readPageColors() }, 450)
    }

    /**
     * Backstop poll, running only while the activity is resumed.
     *
     * Navigation callbacks are not enough on their own: dismissing the entry gate, opening the
     * language switch and scrolling to a section with a different background all change what is
     * painted at the edges without any navigation happening, and the bars would otherwise keep
     * the colour of whatever screen last loaded. The check is two hit-tests, so the cost is
     * nothing next to the WebView itself.
     */
    private val barPoll = object : Runnable {
        override fun run() {
            readPageColors()
            binding.webView.postDelayed(this, 400)
        }
    }

    private fun readPageColors() {
        binding.webView.evaluateJavascript(EDGE_COLOR_JS) { result -> applyPageColors(result) }
    }

    private fun applyPageColors(result: String?) {
        if (result == null || result == "null") return
        val parts = result.trim('"').split("|")
        if (parts.size != 2) return
        val top = parseRgb(parts[0]) ?: return
        val bottom = parseRgb(parts[1]) ?: top

        if (top == lastTopColor && bottom == lastBottomColor) return
        lastTopColor = top
        lastBottomColor = bottom

        binding.statusScrim.setBackgroundColor(top)
        binding.navScrim.setBackgroundColor(bottom)
        binding.root.setBackgroundColor(top)
        binding.webView.setBackgroundColor(top)
        binding.swipeRefresh.setProgressBackgroundColorSchemeColor(top)

        // Dark icons on a light bar, light icons on a dark one — the status bar is
        // otherwise invisible on whichever half of the site does not match the theme.
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.isAppearanceLightStatusBars = ColorUtils.calculateLuminance(top) > 0.4
        controller.isAppearanceLightNavigationBars = ColorUtils.calculateLuminance(bottom) > 0.4
    }

    private fun parseRgb(value: String): Int? {
        val m = RGB_REGEX.find(value) ?: return null
        return runCatching {
            Color.rgb(
                m.groupValues[1].toInt(),
                m.groupValues[2].toInt(),
                m.groupValues[3].toInt()
            )
        }.getOrNull()
    }

    private fun showError(titleRes: Int, messageRes: Int) {
        binding.errorTitle.setText(titleRes)
        binding.errorMessage.setText(messageRes)
        binding.errorView.visibility = View.VISIBLE
        binding.swipeRefresh.isRefreshing = false
        binding.progressBar.visibility = View.GONE
    }

    private fun hasPermission(permission: String): Boolean =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    private fun toast(res: Int) = Toast.makeText(this, res, Toast.LENGTH_LONG).show()

    override fun onPause() {
        super.onPause()
        // onPageFinished misses a cookie set by a redirect or an in-page fetch after the last
        // completed navigation — logging in is exactly that shape.
        CookieManager.getInstance().flush()
        binding.webView.removeCallbacks(barPoll)
        binding.webView.onPause()
    }

    override fun onResume() {
        super.onResume()
        binding.webView.onResume()
        binding.webView.removeCallbacks(barPoll)
        binding.webView.post(barPoll)
    }

    override fun onDestroy() {
        // Destroying a WebView still attached to the view hierarchy is undefined and crashes on
        // some OEM WebView builds.
        (binding.webView.parent as? android.view.ViewGroup)?.removeView(binding.webView)
        binding.webView.destroy()
        super.onDestroy()
    }
}
