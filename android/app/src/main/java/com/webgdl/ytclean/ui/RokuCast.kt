package com.webgdl.ytclean.ui

import android.text.InputType
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.progressindicator.LinearProgressIndicator
import com.webgdl.ytclean.R
import com.webgdl.ytclean.cast.Roku
import com.webgdl.ytclean.cast.RokuDevice
import com.webgdl.ytclean.data.VideoItem
import com.webgdl.ytclean.data.Yt
import com.webgdl.ytclean.player.PlaybackManager
import com.webgdl.ytclean.player.YtMedia
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.schabi.newpipe.extractor.stream.StreamInfo

/** «Enviar a Roku»: elegir la Roku de la red local y cómo reproducir el vídeo en ella. */
object RokuCast {
    private const val PREFS = "roku"

    fun show(activity: AppCompatActivity, item: VideoItem, info: StreamInfo? = null) {
        val prefs = activity.getSharedPreferences(PREFS, AppCompatActivity.MODE_PRIVATE)
        val last = prefs.getString("ip", null)?.let { RokuDevice(it, prefs.getString("name", null) ?: "Roku ($it)") }
        val dp = activity.resources.displayMetrics.density
        val list = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, (8 * dp).toInt(), 0, 0)
        }
        val progress = LinearProgressIndicator(activity).apply { isIndeterminate = true }
        val status = TextView(activity).apply {
            text = "Buscando Roku en la red Wi-Fi…"
            setTextColor(activity.getColor(R.color.fg_muted))
            setPadding((24 * dp).toInt(), (12 * dp).toInt(), (24 * dp).toInt(), (4 * dp).toInt())
        }
        val root = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            addView(progress)
            addView(status)
            addView(list)
        }
        val dialog = MaterialAlertDialogBuilder(activity)
            .setTitle("Enviar a Roku")
            .setView(root)
            .setNeutralButton("Escribir la IP…") { _, _ -> askIp(activity, item, info) }
            .setNegativeButton("Cancelar", null)
            .create()
        val ripple = android.util.TypedValue().also { activity.theme.resolveAttribute(android.R.attr.selectableItemBackground, it, true) }.resourceId
        val shown = HashSet<String>()
        fun addRow(d: RokuDevice, label: String = d.name) {
            if (!shown.add(d.ip)) return
            list.addView(TextView(activity).apply {
                text = "$label\n${d.ip}"
                textSize = 16f
                setTextColor(activity.getColor(R.color.fg))
                setPadding((24 * dp).toInt(), (12 * dp).toInt(), (24 * dp).toInt(), (12 * dp).toInt())
                setBackgroundResource(ripple)
                setOnClickListener { dialog.dismiss(); chooseMode(activity, d, item, info) }
            })
        }
        last?.let { addRow(it, "${it.name} (última usada)") }
        dialog.show()
        activity.lifecycleScope.launch {
            val found = runCatching { withContext(Dispatchers.IO) { Roku.discover(activity) } }
            progress.visibility = View.GONE
            found.getOrNull()?.forEach { addRow(it) }
            status.text = when {
                found.isFailure -> "No se pudo buscar en la red. Comprueba que el teléfono está en la misma Wi-Fi que la Roku."
                found.getOrNull().isNullOrEmpty() && last == null -> "No se encontró ninguna Roku. Comprueba que está encendida y en la misma Wi-Fi, o escribe su IP (Configuración → Red → Información)."
                found.getOrNull().isNullOrEmpty() -> "No se encontraron otras Roku."
                else -> "Elige dónde verlo:"
            }
        }
    }

    private fun askIp(activity: AppCompatActivity, item: VideoItem, info: StreamInfo?) {
        val input = EditText(activity).apply {
            hint = "192.168.1.50"
            inputType = InputType.TYPE_CLASS_TEXT
            setText(activity.getSharedPreferences(PREFS, AppCompatActivity.MODE_PRIVATE).getString("ip", ""))
        }
        MaterialAlertDialogBuilder(activity)
            .setTitle("IP de la Roku")
            .setMessage("En la Roku: Configuración → Red → Información → Dirección IP.")
            .setView(input)
            .setPositiveButton("Conectar") { _, _ ->
                val ip = input.text.toString().trim()
                if (!Roku.isLocalIpv4(ip)) {
                    VideoActions.toast(activity, "Escribe una IP de tu red local, como 192.168.1.50")
                } else {
                    activity.lifecycleScope.launch {
                        val name = withContext(Dispatchers.IO) { runCatching { Roku.name(activity, ip) } }
                        name.onSuccess { chooseMode(activity, RokuDevice(ip, it), item, info) }
                            .onFailure { VideoActions.toast(activity, it.message ?: "No hay ninguna Roku en $ip") }
                    }
                }
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun chooseMode(activity: AppCompatActivity, device: RokuDevice, item: VideoItem, info: StreamInfo?) {
        MaterialAlertDialogBuilder(activity)
            .setTitle("Ver en ${device.name}")
            .setItems(
                arrayOf(
                    "En la app de YouTube de la Roku (recomendado; puede mostrar anuncios)",
                    "Sin anuncios, con el reproductor de la Roku (experimental, calidad 360p)",
                ),
            ) { _, which -> send(activity, device, item, info, adFree = which == 1) }
            .show()
    }

    private fun send(activity: AppCompatActivity, device: RokuDevice, item: VideoItem, known: StreamInfo?, adFree: Boolean) {
        VideoActions.toast(activity, "Enviando a ${device.name}…")
        activity.lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    if (adFree) {
                        val info = known ?: Yt.stream(item.url)
                        val live = YtMedia.isLive(info)
                        val url = if (live) info.hlsUrl?.ifBlank { null } else YtMedia.downloadMuxed(info)?.content
                        url ?: error("Este vídeo no tiene un formato que la Roku pueda reproducir directamente; usa la opción de la app de YouTube.")
                        Roku.playUrl(activity, device.ip, url, info.name, hls = live)
                    } else {
                        val id = Yt.videoId(item.url) ?: error("Enlace de vídeo no válido")
                        Roku.openInYoutube(activity, device.ip, id)
                    }
                }
            }
            result.onSuccess {
                activity.getSharedPreferences(PREFS, AppCompatActivity.MODE_PRIVATE).edit()
                    .putString("ip", device.ip).putString("name", device.name).apply()
                // Se pausa aquí para no oírlo dos veces.
                val manager = PlaybackManager.get(activity)
                if (manager.state.value.current?.url == item.url) manager.player.pause()
                VideoActions.toast(activity, "Reproduciendo en ${device.name}")
            }.onFailure { VideoActions.toast(activity, it.message ?: "No se pudo enviar a la Roku") }
        }
    }
}
