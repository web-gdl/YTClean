package com.webgdl.ytclean.ui

import android.content.Context
import android.widget.EditText
import android.widget.Toast
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.webgdl.ytclean.data.Library
import com.webgdl.ytclean.data.VideoItem
import com.webgdl.ytclean.download.DownloadWorker
import com.webgdl.ytclean.player.PlaybackManager

/** Menú de acciones de un vídeo (pulsación larga). */
object VideoActions {
    fun show(context: Context, item: VideoItem, extra: Pair<String, () -> Unit>? = null) {
        val lib = Library(context)
        val manager = PlaybackManager.get(context)
        val actions = mutableListOf<Pair<String, () -> Unit>>(
            "Reproducir a continuación" to { manager.playNext(item); toast(context, "Se reproducirá a continuación") },
            "Añadir a la cola" to { manager.enqueue(item); toast(context, "Añadido a la cola") },
            (if (lib.isSaved(item.url)) "Quitar de guardados" else "Guardar") to {
                toast(context, if (lib.toggleSaved(item)) "Guardado" else "Quitado de guardados")
            },
            "Añadir a una lista…" to { addToPlaylist(context, item) },
            "Descargar audio" to { download(context, item.url, DownloadWorker.KIND_AUDIO, lib.quality) },
            "Descargar vídeo (${lib.quality}p)" to { download(context, item.url, DownloadWorker.KIND_VIDEO, lib.quality) },
        )
        item.channelUrl?.let { url -> actions += ("Ir al canal${if (item.channel.isNotBlank()) ": ${item.channel}" else ""}") to { openChannel(context, url) } }
        extra?.let { actions += it }
        MaterialAlertDialogBuilder(context)
            .setTitle(item.title.ifBlank { item.url })
            .setItems(actions.map { it.first }.toTypedArray()) { _, which -> actions[which].second() }
            .show()
    }

    fun download(context: Context, url: String, kind: String, height: Int) {
        DownloadWorker.enqueue(context, url, kind, height)
        toast(context, "Descarga iniciada; verás el progreso en las notificaciones")
    }

    fun addToPlaylist(context: Context, item: VideoItem) {
        val lib = Library(context)
        val names = lib.playlists().map { it.name }
        val options = (names + "＋ Nueva lista…").toTypedArray()
        MaterialAlertDialogBuilder(context)
            .setTitle("Añadir a una lista")
            .setItems(options) { _, which ->
                if (which < names.size) {
                    lib.addToPlaylist(names[which], item)
                    toast(context, "Añadido a «${names[which]}»")
                } else {
                    newPlaylist(context) { name ->
                        lib.addToPlaylist(name, item)
                        toast(context, "Añadido a «$name»")
                    }
                }
            }
            .show()
    }

    fun newPlaylist(context: Context, onCreated: (String) -> Unit) {
        val input = EditText(context).apply { hint = "Nombre de la lista" }
        MaterialAlertDialogBuilder(context)
            .setTitle("Nueva lista")
            .setView(input)
            .setPositiveButton("Crear") { _, _ ->
                val name = input.text.toString().trim()
                if (Library(context).createPlaylist(name)) onCreated(name) else toast(context, "Nombre vacío o repetido")
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    fun toast(context: Context, text: String) = Toast.makeText(context, text, Toast.LENGTH_SHORT).show()
}
