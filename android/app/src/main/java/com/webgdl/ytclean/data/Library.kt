package com.webgdl.ytclean.data

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/** Canal suscrito (solo en el teléfono; sin cuenta). */
data class Channel(val url: String, val name: String, val avatar: String?)

/** Lista de reproducción local. */
data class Playlist(val name: String, val items: List<VideoItem>)

/** Archivo descargado. */
data class DownloadRecord(val title: String, val uri: String, val mime: String, val bytes: Long, val at: Long)

/**
 * Todo lo que la app guarda, en las preferencias privadas de la app. Nada sale
 * del teléfono. El historial está desactivado por defecto.
 */
class Library(context: Context) {
    private val sp: SharedPreferences = context.applicationContext.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    // ---- ajustes (las claves coinciden con res/xml/settings.xml) ----
    val quality: Int get() = sp.getString("quality", "720")?.toIntOrNull() ?: 720
    val audioOnly: Boolean get() = sp.getBoolean("audio_only", false)
    val hideShorts: Boolean get() = sp.getBoolean("hide_shorts", true)
    val keepHistory: Boolean get() = sp.getBoolean("history", false)
    val sponsorBlock: Boolean get() = sp.getBoolean("sponsorblock", true)
    val captions: Boolean get() = sp.getBoolean("captions", false)
    /** Tasa de bits de los MP3 (kbps). */
    val mp3Bitrate: Int get() = sp.getString("mp3_bitrate", "192")?.toIntOrNull() ?: 192
    /** País del contenido (código ISO, p. ej. «MX»); vacío = el del teléfono. */
    val region: String get() = sp.getString("region", "") ?: ""

    // ---- guardados ----
    fun saved(): List<VideoItem> = readVideos("saved")
    fun isSaved(url: String) = saved().any { it.url == url }
    fun toggleSaved(item: VideoItem): Boolean {
        val list = saved().toMutableList()
        val i = list.indexOfFirst { it.url == item.url }
        val nowSaved = if (i >= 0) { list.removeAt(i); false } else { list.add(0, item); true }
        writeVideos("saved", list)
        return nowSaved
    }

    // ---- historial (opcional) ----
    fun history(): List<VideoItem> = readVideos("history_items")
    fun addHistory(item: VideoItem) {
        if (!keepHistory || item.title.isBlank()) return
        val list = history().filter { it.url != item.url }.toMutableList()
        list.add(0, item)
        writeVideos("history_items", list.take(500))
    }
    fun clearHistory() = sp.edit().remove("history_items").apply()

    // ---- suscripciones ----
    fun subscriptions(): List<Channel> = readArray("subs").map {
        Channel(it.getString("url"), it.optString("name"), it.optString("avatar").ifBlank { null })
    }
    fun isSubscribed(url: String) = subscriptions().any { it.url == url }
    fun toggleSubscription(channel: Channel): Boolean {
        val list = subscriptions().toMutableList()
        val i = list.indexOfFirst { it.url == channel.url }
        val now = if (i >= 0) { list.removeAt(i); false } else { list.add(channel); true }
        writeArray("subs", list.sortedBy { it.name.lowercase() }.map {
            JSONObject().put("url", it.url).put("name", it.name).put("avatar", it.avatar ?: "")
        })
        return now
    }

    // ---- listas locales ----
    fun playlists(): List<Playlist> = readArray("playlists").map { o ->
        Playlist(o.getString("name"), videosFrom(o.optJSONArray("items") ?: JSONArray()))
    }
    fun playlist(name: String): Playlist? = playlists().firstOrNull { it.name == name }
    private fun writePlaylists(list: List<Playlist>) = writeArray("playlists", list.map {
        JSONObject().put("name", it.name).put("items", videosTo(it.items))
    })
    fun createPlaylist(name: String): Boolean {
        val n = name.trim()
        if (n.isEmpty() || playlist(n) != null) return false
        writePlaylists(playlists() + Playlist(n, emptyList()))
        return true
    }
    fun deletePlaylist(name: String) = writePlaylists(playlists().filter { it.name != name })
    fun addToPlaylist(name: String, item: VideoItem) = writePlaylists(playlists().map {
        if (it.name == name && it.items.none { v -> v.url == item.url }) it.copy(items = it.items + item) else it
    })
    fun removeFromPlaylist(name: String, url: String) = writePlaylists(playlists().map {
        if (it.name == name) it.copy(items = it.items.filter { v -> v.url != url }) else it
    })

    // ---- descargas ----
    fun downloads(): List<DownloadRecord> = readArray("downloads").map {
        DownloadRecord(it.optString("title"), it.getString("uri"), it.optString("mime"), it.optLong("bytes"), it.optLong("at"))
    }
    fun addDownload(r: DownloadRecord) {
        val list = listOf(r) + downloads().filter { it.uri != r.uri }
        writeArray("downloads", list.take(300).map {
            JSONObject().put("title", it.title).put("uri", it.uri).put("mime", it.mime).put("bytes", it.bytes).put("at", it.at)
        })
    }
    fun removeDownload(uri: String) = writeArray("downloads", readArray("downloads").filter { it.optString("uri") != uri })

    /** Borra todo: ajustes, guardados, historial, suscripciones, listas y registro de descargas. */
    fun clearAll() = sp.edit().clear().apply()

    // ---- JSON ----
    private fun readArray(key: String): List<JSONObject> = runCatching {
        val arr = JSONArray(sp.getString(key, "[]"))
        (0 until arr.length()).map { arr.getJSONObject(it) }
    }.getOrDefault(emptyList())

    private fun writeArray(key: String, list: List<JSONObject>) {
        val arr = JSONArray()
        list.forEach { arr.put(it) }
        sp.edit().putString(key, arr.toString()).apply()
    }

    private fun readVideos(key: String): List<VideoItem> = runCatching { videosFrom(JSONArray(sp.getString(key, "[]"))) }.getOrDefault(emptyList())
    private fun writeVideos(key: String, list: List<VideoItem>) = sp.edit().putString(key, videosTo(list).toString()).apply()

    companion object {
        const val NAME = "ytclean"

        fun videosFrom(arr: JSONArray): List<VideoItem> = (0 until arr.length()).mapNotNull { i ->
            val o = arr.optJSONObject(i) ?: return@mapNotNull null
            VideoItem(
                url = o.optString("url").ifBlank { return@mapNotNull null },
                title = o.optString("title"),
                channel = o.optString("channel"),
                channelUrl = o.optString("channelUrl").ifBlank { null },
                thumbnail = o.optString("thumbnail").ifBlank { null },
                durationSeconds = o.optLong("duration", -1),
            )
        }

        fun videosTo(list: List<VideoItem>): JSONArray {
            val arr = JSONArray()
            list.forEach {
                arr.put(
                    JSONObject()
                        .put("url", it.url)
                        .put("title", it.title)
                        .put("channel", it.channel)
                        .put("channelUrl", it.channelUrl ?: "")
                        .put("thumbnail", it.thumbnail ?: "")
                        .put("duration", it.durationSeconds),
                )
            }
            return arr
        }
    }
}
