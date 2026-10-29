package com.webgdl.ytclean.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import coil3.load
import com.webgdl.ytclean.data.Yt
import com.webgdl.ytclean.databinding.ActivityListBinding
import com.webgdl.ytclean.player.PlaybackManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Lista de reproducción de YouTube (enlace compartido o pegado): ver, reproducir o descargar en MP3. */
class PlaylistActivity : AppCompatActivity() {
    private lateinit var b: ActivityListBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityListBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.toolbar.setNavigationOnClickListener { finish() }
        val url = intent.getStringExtra(EXTRA_URL) ?: return finish()
        val controller = FeedController(
            lifecycleScope, b.list, b.progress, b.message, "Esta lista está vacía o es privada.",
            onClick = { item, all ->
                PlaybackManager.get(this).playQueue(all, all.indexOf(item))
                startActivity(Intent(this, PlayerActivity::class.java))
            },
        )
        b.toolbar.title = "Lista de reproducción"
        b.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val (info, feed) = withContext(Dispatchers.IO) { Yt.playlist(url) }
                val name = info.name.ifBlank { "Lista" }
                b.toolbar.title = name
                b.header.visibility = View.VISIBLE
                b.headerTitle.text = name
                b.headerSub.text = listOfNotNull(
                    info.uploaderName?.ifBlank { null },
                    if (info.streamCount >= 0) "${info.streamCount} vídeos" else null,
                ).joinToString(" · ")
                b.avatar.load(Yt.bestImage(info.thumbnails, 176))
                b.actions.visibility = View.VISIBLE
                b.actionPrimary.text = "Reproducir todo"
                b.actionPrimary.setOnClickListener {
                    val items = controller.loaded
                    if (items.isNotEmpty()) {
                        PlaybackManager.get(this@PlaylistActivity).playQueue(items, 0)
                        startActivity(Intent(this@PlaylistActivity, PlayerActivity::class.java))
                    }
                }
                b.actionSecondary.text = "Descargar MP3"
                b.actionSecondary.setOnClickListener { downloadAll(url, name) }
                controller.show(feed)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                b.progress.visibility = View.GONE
                b.message.text = errorMessage(e)
                b.message.visibility = View.VISIBLE
            }
        }
    }

    /** Carga todas las páginas de la lista y pide confirmación antes de poner en cola los MP3. */
    private fun downloadAll(url: String, name: String) {
        b.actionSecondary.isEnabled = false
        b.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val all = withContext(Dispatchers.IO) { Yt.playlistAll(url) }
                VideoActions.confirmMp3List(this@PlaylistActivity, all, name)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                VideoActions.toast(this@PlaylistActivity, errorMessage(e))
            } finally {
                b.progress.visibility = View.GONE
                b.actionSecondary.isEnabled = true
            }
        }
    }

    companion object {
        const val EXTRA_URL = "url"
    }
}
