plugins {
    id("com.android.application")
}

// Where the app points. Debug defaults to the dev server reached through `adb reverse tcp:3840 tcp:3840`
// (localhost counts as a secure origin, so the selfie camera works). A release build must be given the real
// https site:  gradlew assembleRelease -PthunaUrl=https://your-domain/
val debugUrl = (project.findProperty("thunaDebugUrl") as String?) ?: "http://localhost:3840/"
val releaseUrl = project.findProperty("thunaUrl") as String?

android {
    namespace = "com.thuna.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.thuna.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    val keystoreFile = rootProject.file("thuna-release.jks")
    val keystorePass = rootProject.file("keystore.pass.txt").takeIf { it.exists() }?.readText()?.trim()

    signingConfigs {
        create("release") {
            storeFile = keystoreFile
            storePassword = keystorePass
            keyAlias = "thuna"
            keyPassword = keystorePass
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
            buildConfigField("String", "BASE_URL", "\"${releaseUrl ?: "https://REPLACE-WITH-DOMAIN/"}\"")
        }
        debug {
            // same key as release so a debug install can be upgraded in place by a release APK
            signingConfig = signingConfigs.getByName("release")
            buildConfigField("String", "BASE_URL", "\"$debugUrl\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        viewBinding = true
        buildConfig = true
    }
}

// A release pointing at nowhere (or at plain http) must never be produced.
tasks.matching { it.name == "assembleRelease" || it.name == "bundleRelease" }.configureEach {
    doFirst {
        require(releaseUrl?.startsWith("https://") == true) {
            "Release build needs the live site: gradlew assembleRelease -PthunaUrl=https://your-domain/"
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
}
