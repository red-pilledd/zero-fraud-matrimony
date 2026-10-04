package com.thuna.app

import android.net.Uri

object Config {

    val BASE_URL: String = BuildConfig.BASE_URL

    private val ROOT_HOST: String = Uri.parse(BASE_URL).host!!.lowercase().removePrefix("www.")

    /**
     * True only for the site itself or a genuine subdomain of it. A plain suffix test would also
     * accept a lookalike such as `evil-thuna.in` and keep it inside the WebView that holds the
     * signed-in session cookie — and grant it the camera. The leading dot makes it a subdomain test.
     */
    fun isInternalHost(host: String?): Boolean {
        val h = host?.lowercase() ?: return false
        return h == ROOT_HOST || h.endsWith(".$ROOT_HOST")
    }

    fun isInternalUrl(url: String?): Boolean =
        url != null && isInternalHost(runCatching { Uri.parse(url).host }.getOrNull())

    /**
     * Razorpay Checkout runs inside the page (script + iframe from these hosts) and must stay in the
     * WebView; the payment itself is handed to the UPI app through upi:// / intent:// links.
     */
    fun isPaymentHost(host: String?): Boolean {
        val h = host?.lowercase() ?: return false
        return h == "razorpay.com" || h.endsWith(".razorpay.com")
    }
}
