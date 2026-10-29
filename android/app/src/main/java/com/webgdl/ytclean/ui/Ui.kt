package com.webgdl.ytclean.ui

import android.content.Context
import android.content.Intent
import com.webgdl.ytclean.data.Yt
import org.schabi.newpipe.extractor.exceptions.AgeRestrictedContentException
import org.schabi.newpipe.extractor.exceptions.ContentNotAvailableException
import org.schabi.newpipe.extractor.exceptions.GeographicRestrictionException
import org.schabi.newpipe.extractor.exceptions.PrivateContentException
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import org.schabi.newpipe.extractor.exceptions.SignInConfirmNotBotException
import java.io.IOException
import java.text.NumberFormat
import java.util.Locale

/** Mensaje comprensible para cualquier error del extractor o de la red. */
fun errorMessage(e: Throwable): String {
    var t: Throwable? = e
    while (t != null) {
        when (t) {
            is AgeRestrictedContentException -> return "Este vídeo tiene restricción de edad y YouTube exige iniciar sesión. YT Clean no usa cuentas."
            is GeographicRestrictionException -> return "Este vídeo no está disponible en tu país."
            is PrivateContentException -> return "Este vídeo es privado."
            is SignInConfirmNotBotException -> return "YouTube pide confirmar que no eres un robot desde esta red. Prueba más tarde o con otra conexión."
            is ReCaptchaException -> return "YouTube está limitando las peticiones desde esta red. Prueba más tarde."
            is ContentNotAvailableException -> return "El vídeo no está disponible."
            is IOException -> return "Sin conexión con YouTube. Comprueba tu red."
        }
        t = t.cause
    }
    return "No se pudo cargar: ${e.message ?: e.javaClass.simpleName}"
}

fun formatDuration(seconds: Long): String {
    if (seconds <= 0) return ""
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    val s = seconds % 60
    return if (h > 0) String.format(Locale.ROOT, "%d:%02d:%02d", h, m, s) else String.format(Locale.ROOT, "%d:%02d", m, s)
}

fun formatCount(n: Long): String {
    if (n < 0) return ""
    return when {
        n >= 1_000_000_000 -> String.format(Locale.getDefault(), "%.1f mil M", n / 1e9)
        n >= 1_000_000 -> String.format(Locale.getDefault(), "%.1f M", n / 1e6)
        n >= 10_000 -> String.format(Locale.getDefault(), "%.0f mil", n / 1e3)
        else -> NumberFormat.getInstance().format(n)
    }
}

/** Primer enlace http(s) dentro de un texto compartido. */
fun firstUrl(text: String?): String? = text?.let { Regex("https?://\\S+").find(it)?.value }

fun openVideo(context: Context, url: String) {
    context.startActivity(Intent(context, PlayerActivity::class.java).putExtra(PlayerActivity.EXTRA_URL, url))
}

fun openChannel(context: Context, url: String) {
    context.startActivity(Intent(context, ChannelActivity::class.java).putExtra(ChannelActivity.EXTRA_URL, url))
}

/** Abre un enlace de YouTube; devuelve false si no es un vídeo ni un canal. */
fun openYoutubeLink(context: Context, url: String): Boolean = when {
    Yt.isVideoUrl(url) -> { openVideo(context, url); true }
    Yt.isChannelUrl(url) -> { openChannel(context, url); true }
    else -> false
}
