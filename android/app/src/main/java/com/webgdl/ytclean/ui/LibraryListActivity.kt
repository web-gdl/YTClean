package com.webgdl.ytclean.ui

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.webgdl.ytclean.data.Library
import com.webgdl.ytclean.data.VideoItem
import com.webgdl.ytclean.databinding.ActivityListBinding
import com.webgdl.ytclean.player.PlaybackManager

/** Listas de vídeos locales: guardados, historial o una lista de reproducción. */
class LibraryListActivity : AppCompatActivity() {
    private lateinit var b: ActivityListBinding
    private lateinit var controller: FeedController
    private lateinit var library: Library
    private var mode = MODE_SAVED
    private var playlist = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityListBinding.inflate(layoutInflater)
        setContentView(b.root)
        library = Library(this)
        mode = intent.getStringExtra(EXTRA_MODE) ?: MODE_SAVED
        playlist = intent.getStringExtra(EXTRA_PLAYLIST).orEmpty()
        b.toolbar.setNavigationOnClickListener { finish() }
        b.toolbar.title = when (mode) {
            MODE_HISTORY -> "Historial"
            MODE_PLAYLIST -> playlist
            else -> "Guardados"
        }
        val empty = when (mode) {
            MODE_HISTORY -> if (library.keepHistory) "El historial está vacío." else "El historial está desactivado. Actívalo en Ajustes si lo quieres (solo se guarda en este teléfono)."
            MODE_PLAYLIST -> "La lista está vacía. Añade vídeos con una pulsación larga o desde el reproductor."
            else -> "Todavía no has guardado vídeos. Mantén pulsado un vídeo o usa «Guardar» al verlo."
        }
        controller = FeedController(
            lifecycleScope, b.list, b.progress, b.message, empty,
            onLongClick = { item -> VideoActions.show(this, item, removeAction(item)) },
            onClick = { item, all -> PlaybackManager.get(this).playQueue(all, all.indexOf(item)); startActivity(Intent(this, PlayerActivity::class.java)) },
        )

        b.actions.visibility = View.VISIBLE
        b.actionPrimary.text = "Reproducir todo"
        b.actionPrimary.setOnClickListener { playAll(shuffle = false) }
        b.actionSecondary.text = when (mode) {
            MODE_HISTORY -> "Borrar historial"
            MODE_PLAYLIST -> "Aleatorio"
            else -> "Aleatorio"
        }
        b.actionSecondary.setOnClickListener {
            if (mode == MODE_HISTORY) {
                MaterialAlertDialogBuilder(this).setMessage("¿Borrar el historial?")
                    .setPositiveButton("Borrar") { _, _ -> library.clearHistory(); refresh() }
                    .setNegativeButton("Cancelar", null).show()
            } else {
                playAll(shuffle = true)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun items(): List<VideoItem> = when (mode) {
        MODE_HISTORY -> library.history()
        MODE_PLAYLIST -> library.playlist(playlist)?.items.orEmpty()
        else -> library.saved()
    }

    private fun refresh() = controller.showItems(items())

    private fun playAll(shuffle: Boolean) {
        val list = items().let { if (shuffle) it.shuffled() else it }
        if (list.isEmpty()) return
        PlaybackManager.get(this).playQueue(list, 0)
        startActivity(Intent(this, PlayerActivity::class.java))
    }

    private fun removeAction(item: VideoItem): Pair<String, () -> Unit>? = when (mode) {
        MODE_PLAYLIST -> "Quitar de esta lista" to { library.removeFromPlaylist(playlist, item.url); refresh() }
        MODE_SAVED -> null
        else -> null
    }

    companion object {
        const val EXTRA_MODE = "mode"
        const val EXTRA_PLAYLIST = "playlist"
        const val MODE_SAVED = "saved"
        const val MODE_HISTORY = "history"
        const val MODE_PLAYLIST = "playlist"

        fun open(context: Context, mode: String, playlist: String? = null) {
            context.startActivity(
                Intent(context, LibraryListActivity::class.java).putExtra(EXTRA_MODE, mode).putExtra(EXTRA_PLAYLIST, playlist),
            )
        }
    }
}
