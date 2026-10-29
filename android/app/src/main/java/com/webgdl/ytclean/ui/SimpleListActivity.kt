package com.webgdl.ytclean.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.webgdl.ytclean.data.Library
import com.webgdl.ytclean.databinding.ActivityListBinding

/** Listas de texto: listas de reproducción, canales suscritos y descargas. */
class SimpleListActivity : AppCompatActivity() {
    private lateinit var b: ActivityListBinding
    private lateinit var library: Library
    private var mode = MODE_PLAYLISTS

    private data class Row(val title: String, val subtitle: String, val onClick: () -> Unit, val onLongClick: (() -> Unit)?)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityListBinding.inflate(layoutInflater)
        setContentView(b.root)
        library = Library(this)
        mode = intent.getStringExtra(EXTRA_MODE) ?: MODE_PLAYLISTS
        b.toolbar.setNavigationOnClickListener { finish() }
        b.toolbar.title = when (mode) {
            MODE_CHANNELS -> "Canales suscritos"
            MODE_DOWNLOADS -> "Descargas"
            else -> "Listas de reproducción"
        }
        b.list.layoutManager = LinearLayoutManager(this)
        if (mode == MODE_PLAYLISTS) {
            b.actions.visibility = View.VISIBLE
            b.actionPrimary.text = "Nueva lista"
            b.actionPrimary.setOnClickListener { VideoActions.newPlaylist(this) { refresh() } }
            b.actionSecondary.visibility = View.GONE
        }
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun refresh() {
        val rows = when (mode) {
            MODE_CHANNELS -> library.subscriptions().map { c ->
                Row(c.name, "Mantén pulsado para dejar de seguir", { openChannel(this, c.url) }) {
                    confirm("¿Dejar de seguir «${c.name}»?") { library.toggleSubscription(c); refresh() }
                }
            }
            MODE_DOWNLOADS -> library.downloads().map { d ->
                Row(d.title, "${d.mime.substringBefore('/').let { if (it == "audio") "Audio" else "Vídeo" }} · ${d.bytes / 1_000_000} MB", { openFile(d.uri, d.mime) }) {
                    confirm("¿Quitar «${d.title}» de la lista? El archivo sigue en Descargas/YTClean.") { library.removeDownload(d.uri); refresh() }
                }
            }
            else -> library.playlists().map { p ->
                Row(p.name, "${p.items.size} vídeos", { LibraryListActivity.open(this, LibraryListActivity.MODE_PLAYLIST, p.name) }) {
                    confirm("¿Borrar la lista «${p.name}»?") { library.deletePlaylist(p.name); refresh() }
                }
            }
        }
        b.message.visibility = if (rows.isEmpty()) View.VISIBLE else View.GONE
        b.message.text = when (mode) {
            MODE_CHANNELS -> "No sigues ningún canal. Abre un canal y pulsa «Suscribirse»."
            MODE_DOWNLOADS -> "No hay descargas. Usa «Descargar» en el reproductor o en el menú de un vídeo."
            else -> "No hay listas. Crea una con «Nueva lista»."
        }
        b.list.adapter = RowAdapter(rows)
    }

    private fun openFile(uri: String, mime: String) {
        runCatching {
            startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(uri), mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
        }.onFailure { VideoActions.toast(this, "No hay ninguna app para abrir este archivo") }
    }

    private fun confirm(message: String, action: () -> Unit) {
        MaterialAlertDialogBuilder(this).setMessage(message)
            .setPositiveButton("Aceptar") { _, _ -> action() }
            .setNegativeButton("Cancelar", null).show()
    }

    private class RowAdapter(private val rows: List<Row>) : RecyclerView.Adapter<RowAdapter.Holder>() {
        class Holder(view: View) : RecyclerView.ViewHolder(view) {
            val title: TextView = view.findViewById(android.R.id.text1)
            val subtitle: TextView = view.findViewById(android.R.id.text2)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
            Holder(LayoutInflater.from(parent.context).inflate(android.R.layout.simple_list_item_2, parent, false))

        override fun getItemCount() = rows.size

        override fun onBindViewHolder(holder: Holder, position: Int) {
            val row = rows[position]
            holder.title.text = row.title
            holder.subtitle.text = row.subtitle
            holder.itemView.setOnClickListener { row.onClick() }
            holder.itemView.setOnLongClickListener { row.onLongClick?.invoke(); row.onLongClick != null }
        }
    }

    companion object {
        const val EXTRA_MODE = "mode"
        const val MODE_PLAYLISTS = "playlists"
        const val MODE_CHANNELS = "channels"
        const val MODE_DOWNLOADS = "downloads"

        fun open(context: Context, mode: String) {
            context.startActivity(Intent(context, SimpleListActivity::class.java).putExtra(EXTRA_MODE, mode))
        }
    }
}
