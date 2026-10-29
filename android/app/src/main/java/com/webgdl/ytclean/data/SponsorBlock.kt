package com.webgdl.ytclean.data

import com.webgdl.ytclean.net.DownloaderImpl
import okhttp3.Request
import org.json.JSONArray
import java.net.URLEncoder
import java.security.MessageDigest

/** Tramo a saltar, en milisegundos. */
data class Segment(val startMs: Long, val endMs: Long, val category: String)

/**
 * SponsorBlock (https://sponsor.ajay.app), base de datos comunitaria de tramos
 * patrocinados. Por privacidad se usa la consulta por prefijo de hash: solo se
 * envían los 4 primeros caracteres del SHA-256 del ID del vídeo, y el servidor
 * devuelve los segmentos de muchos vídeos que comparten ese prefijo.
 */
object SponsorBlock {
    private const val API = "https://sponsor.ajay.app/api/skipSegments/"
    val CATEGORIES = listOf("sponsor", "selfpromo", "interaction", "music_offtopic")

    fun label(category: String) = when (category) {
        "sponsor" -> "patrocinio"
        "selfpromo" -> "autopromoción"
        "interaction" -> "recordatorio de suscripción"
        "music_offtopic" -> "parte sin música"
        else -> category
    }

    /** Segmentos a saltar; lista vacía si no hay o si falla la consulta. */
    fun segments(videoId: String): List<Segment> = runCatching {
        val hash = MessageDigest.getInstance("SHA-256").digest(videoId.toByteArray())
            .joinToString("") { "%02x".format(it) }.take(4)
        val categories = URLEncoder.encode(JSONArray(CATEGORIES).toString(), "UTF-8")
        val request = Request.Builder()
            .url("$API$hash?categories=$categories&actionType=skip")
            .header("User-Agent", "YTClean")
            .build()
        DownloaderImpl.getInstance().client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return emptyList()
            val arr = JSONArray(response.body.string())
            val out = mutableListOf<Segment>()
            for (i in 0 until arr.length()) {
                val video = arr.getJSONObject(i)
                if (video.optString("videoID") != videoId) continue
                val segs = video.optJSONArray("segments") ?: continue
                for (j in 0 until segs.length()) {
                    val s = segs.getJSONObject(j)
                    val range = s.optJSONArray("segment") ?: continue
                    val start = (range.optDouble(0) * 1000).toLong()
                    val end = (range.optDouble(1) * 1000).toLong()
                    if (end - start >= 1000) out += Segment(start, end, s.optString("category"))
                }
            }
            out.sortedBy { it.startMs }
        }
    }.getOrDefault(emptyList())
}
