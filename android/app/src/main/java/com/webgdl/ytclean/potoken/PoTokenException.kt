// Portado de NewPipe (GPL-3.0-or-later): https://github.com/TeamNewPipe/NewPipe/tree/dev/app/src/main/java/org/schabi/newpipe/util/potoken
package com.webgdl.ytclean.potoken

class PoTokenException(message: String) : Exception(message)

// to be thrown if the WebView provided by the system is broken
class BadWebViewException(message: String) : Exception(message)

fun buildExceptionForJsError(error: String): Exception {
    return if (error.contains("SyntaxError")) {
        BadWebViewException(error)
    } else {
        PoTokenException(error)
    }
}

/** Equivalente a DeviceUtils.supportsWebView() de NewPipe. */
fun supportsWebView(): Boolean = try {
    android.webkit.CookieManager.getInstance()
    true
} catch (_: Throwable) {
    false
}
