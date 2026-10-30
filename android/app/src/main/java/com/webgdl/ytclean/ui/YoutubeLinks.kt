package com.webgdl.ytclean.ui

import android.content.Context
import android.content.Intent
import android.content.pm.verify.domain.DomainVerificationManager
import android.content.pm.verify.domain.DomainVerificationUserState
import android.net.Uri
import android.os.Build
import android.provider.Settings

/** Enlaces de YouTube: normalización y estado de «Abrir de forma predeterminada». */
object YoutubeLinks {
    /** Dominios declarados en el manifiesto. */
    val HOSTS = listOf(
        "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
        "youtu.be", "www.youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com",
    )

    /** Convierte variantes (vnd.youtube:ID, http, embed de nocookie) en un enlace que NewPipe reconoce. */
    fun normalize(raw: String): String {
        val text = raw.trim()
        Regex("^vnd\\.youtube:(?://)?([\\w-]{11})").find(text)?.let { return "https://www.youtube.com/watch?v=${it.groupValues[1]}" }
        var url = text.replaceFirst(Regex("^http://", RegexOption.IGNORE_CASE), "https://")
        url = url.replaceFirst(Regex("^https://(www\\.)?youtube-nocookie\\.com/", RegexOption.IGNORE_CASE), "https://www.youtube.com/")
        return url
    }

    fun isYoutubeHost(url: String): Boolean =
        runCatching { Uri.parse(url).host?.lowercase() in HOSTS }.getOrDefault(false)

    /** Texto de búsqueda de un enlace /results?search_query=… (o null). */
    fun searchQuery(url: String): String? = runCatching {
        val uri = Uri.parse(url)
        if (uri.path?.startsWith("/results") == true) uri.getQueryParameter("search_query") ?: uri.getQueryParameter("q") else null
    }.getOrNull()?.ifBlank { null }

    /**
     * Cuántos dominios de YouTube abre ya YT Clean por defecto (Android 12+), como (activos, total);
     * null en Android 11 o anterior, donde se elige con «Siempre» al abrir un enlace.
     */
    fun defaultStatus(context: Context): Pair<Int, Int>? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null
        return runCatching {
            val manager = context.getSystemService(DomainVerificationManager::class.java)
            val state = manager.getDomainVerificationUserState(context.packageName) ?: return null
            val map = state.hostToStateMap
            val on = map.count { it.value != DomainVerificationUserState.DOMAIN_STATE_NONE }
            val enabled = state.isLinkHandlingAllowed
            (if (enabled) on else 0) to map.size
        }.getOrNull()
    }

    fun isDefault(context: Context): Boolean = defaultStatus(context)?.let { it.first >= it.second } ?: false

    /** Abre la pantalla del sistema donde se activan los enlaces de la app. */
    fun openSettings(context: Context) {
        val pkg = Uri.parse("package:${context.packageName}")
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Intent(Settings.ACTION_APP_OPEN_BY_DEFAULT_SETTINGS, pkg)
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
        }
        runCatching { context.startActivity(intent) }
            .onFailure { runCatching { context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)) } }
    }

    /** Pasos para el usuario, según la versión de Android. */
    fun instructions(): String = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        "En la pantalla que se abre:\n\n1. Activa «Abrir enlaces compatibles».\n2. Toca «Añadir enlace» y marca todos los de YouTube (youtube.com, youtu.be, m.youtube.com…).\n\n" +
            "Si Android dice que esos enlaces ya los abre la app de YouTube, entra en Ajustes → Apps → YouTube → Abrir de forma predeterminada, desactiva «Abrir enlaces compatibles» y repite estos pasos."
    } else {
        "La próxima vez que abras un enlace de YouTube, elige YT Clean y toca «Siempre».\n\nSi antes elegiste otra app como predeterminada, quita esa preferencia en Ajustes → Apps → (esa app) → Abrir de forma predeterminada → «Borrar valores predeterminados»."
    }
}
