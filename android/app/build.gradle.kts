import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// La clave de firma llega por el entorno (en CI, desde secretos de GitHub); nunca
// se guarda en el repositorio. Sin ella, se usa la clave de depuración.
val keystoreFile: String? = System.getenv("YC_KEYSTORE_FILE")

android {
    namespace = "com.webgdl.ytclean"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.webgdl.ytclean"
        minSdk = 24
        targetSdk = 36
        versionCode = (System.getenv("YC_VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("YC_VERSION_NAME") ?: "0.3.0"
    }

    signingConfigs {
        create("personal") {
            if (keystoreFile != null) {
                storeFile = file(keystoreFile)
                storePassword = System.getenv("YC_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("YC_KEY_ALIAS")
                keyPassword = System.getenv("YC_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (keystoreFile != null) signingConfigs.getByName("personal") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // NewPipeExtractor usa java.time y java.nio: necesario en Android < 8.
        isCoreLibraryDesugaringEnabled = true
    }

    buildFeatures {
        viewBinding = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += setOf(
                "META-INF/README.md",
                "META-INF/CHANGES",
                "META-INF/COPYRIGHT",
                "META-INF/DEPENDENCIES",
                "META-INF/*.kotlin_module",
            )
        }
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
        optIn.add("androidx.media3.common.util.UnstableApi")
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs_nio:2.1.5")

    // Extracción de YouTube (misma versión que usa NewPipe en desarrollo).
    implementation("com.github.TeamNewPipe:NewPipeExtractor:e8f89145a830b4d6cae32412007f24ea8b36c73a")
    implementation("com.github.TeamNewPipe:nanojson:e9d656ddb49a412a5a0a5d5ef20ca7ef09549996")
    implementation("com.squareup.okhttp3:okhttp:5.3.2")

    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.11.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.10.0")
    implementation("androidx.recyclerview:recyclerview:1.4.0")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("com.google.android.material:material:1.13.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")

    implementation("androidx.media3:media3-exoplayer:1.9.2")
    implementation("androidx.media3:media3-exoplayer-dash:1.9.2")
    implementation("androidx.media3:media3-exoplayer-hls:1.9.2")
    implementation("androidx.media3:media3-ui:1.9.2")

    implementation("io.coil-kt.coil3:coil:3.4.0")
    implementation("io.coil-kt.coil3:coil-network-okhttp:3.4.0")

    // Requeridos por el generador de PoToken (portado de NewPipe).
    implementation("io.reactivex.rxjava3:rxjava:3.1.12")
    implementation("io.reactivex.rxjava3:rxandroid:3.0.2")
}
