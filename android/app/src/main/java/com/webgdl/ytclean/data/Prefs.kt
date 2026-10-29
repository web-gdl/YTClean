package com.webgdl.ytclean.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Ajustes y vídeos guardados, solo en el teléfono (SharedPreferences privadas
 * de la app). Sin historial, sin identificadores, sin sincronización.
 */
class Prefs(context: Context) {
    private val sp = context.applicationContext.getSharedPreferences("ytclean", Context.MODE_PRIVATE)

    /** Altura máxima preferida del vídeo (p). */
    var quality: Int
        get() = sp.getInt("quality", 720)
        set(v) = sp.edit().putInt("quality", v).apply()

    var audioOnly: Boolean
        get() = sp.getBoolean("audioOnly", false)
        set(v) = sp.edit().putBoolean("audioOnly", v).apply()

    fun saved(): List<VideoItem> {
        val raw = sp.getString("saved", null) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                VideoItem(
                    url = o.getString("url"),
                    title = o.optString("title"),
                    channel = o.optString("channel"),
                    channelUrl = o.optString("channelUrl").ifBlank { null },
                    thumbnail = o.optString("thumbnail").ifBlank { null },
                    durationSeconds = o.optLong("duration", -1),
                    views = -1,
                    uploaded = null,
                    isLive = false,
                )
            }
        }.getOrDefault(emptyList())
    }

    fun isSaved(url: String) = saved().any { it.url == url }

    /** Guarda o quita; devuelve true si quedó guardado. */
    fun toggleSaved(item: VideoItem): Boolean {
        val list = saved().toMutableList()
        val existing = list.indexOfFirst { it.url == item.url }
        val nowSaved = if (existing >= 0) {
            list.removeAt(existing)
            false
        } else {
            list.add(0, item)
            true
        }
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
        sp.edit().putString("saved", arr.toString()).apply()
        return nowSaved
    }

    fun clearAll() = sp.edit().clear().apply()
}
