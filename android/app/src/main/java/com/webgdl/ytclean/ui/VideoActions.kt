package com.webgdl.ytclean.ui

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.widget.EditText
import android.widget.Toast
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
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
            "Descargar MP3" to { downloadMp3(context, listOf(item)) },
            "Descargar audio original (M4A)" to { download(context, item.url, DownloadWorker.KIND_AUDIO, lib.quality) },
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

    /**
     * Convierte a MP3 uno o varios vídeos (de uno en uno, en segundo plano). [folder] es la
     * subcarpeta y el álbum: el nombre de la lista.
     */
    fun downloadMp3(context: Context, items: List<VideoItem>, folder: String? = null) {
        if (items.isEmpty()) return
        requestMusicFolderPermission(context)
        DownloadWorker.enqueueMp3(context, items.map { it.url }, folder, Library(context).mp3Bitrate)
        val where = "Música/YTClean" + (folder?.let { "/" + DownloadWorker.safeName(it) } ?: "")
        toast(context, if (items.size == 1) "Convirtiendo a MP3; se guardará en $where" else "${items.size} vídeos en cola para MP3; se guardarán en $where")
    }

    /** Confirma y descarga en MP3 una lista entera. */
    fun confirmMp3List(context: Context, items: List<VideoItem>, folder: String) {
        if (items.isEmpty()) return toast(context, "La lista está vacía")
        val kbps = Library(context).mp3Bitrate
        MaterialAlertDialogBuilder(context)
            .setTitle("Descargar en MP3")
            .setMessage("${items.size} vídeos de «$folder» a $kbps kbps. Se convierten de uno en uno y se guardan en Música/YTClean/${DownloadWorker.safeName(folder)}. El progreso se ve en las notificaciones.")
            .setPositiveButton("Descargar") { _, _ -> downloadMp3(context, items, folder) }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    /** En Android 9 o anterior hace falta el permiso de almacenamiento para usar la carpeta pública Música. */
    private fun requestMusicFolderPermission(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return
        val activity = context as? Activity ?: return
        val perm = Manifest.permission.WRITE_EXTERNAL_STORAGE
        if (ContextCompat.checkSelfPermission(activity, perm) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(activity, arrayOf(perm), 7)
        }
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
