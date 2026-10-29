package com.webgdl.ytclean.ui

import android.app.PictureInPictureParams
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.text.TextUtils
import android.util.Rational
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.text.HtmlCompat
import androidx.core.view.WindowCompat
import androidx.core.widget.TextViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.Player
import androidx.media3.ui.AspectRatioFrameLayout
import coil3.load
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.webgdl.ytclean.R
import com.webgdl.ytclean.data.Library
import com.webgdl.ytclean.data.Yt
import com.webgdl.ytclean.databinding.ActivityPlayerBinding
import com.webgdl.ytclean.download.DownloadWorker
import com.webgdl.ytclean.player.PlaybackManager
import com.webgdl.ytclean.player.PlaybackState
import com.webgdl.ytclean.player.YtMedia
import kotlinx.coroutines.launch

/**
 * Pantalla del reproductor. El reproductor en sí vive en [PlaybackManager] y
 * sigue sonando en segundo plano (con controles en la notificación) al salir.
 */
class PlayerActivity : AppCompatActivity() {
    private lateinit var b: ActivityPlayerBinding
    private lateinit var manager: PlaybackManager
    private lateinit var library: Library
    private var fullscreen = false
    /** Diseño de dos paneles (pantallas anchas en horizontal, p. ej. el autoestéreo 8227L). */
    private var wide = false
    private val hiddenForFullscreen = mutableListOf<Pair<View, Int>>()
    private val resizedForFullscreen = mutableListOf<Pair<View, ViewGroup.LayoutParams>>()
    private var descriptionExpanded = false
    private var shownInfoFor: String? = null
    private val bufferingListener = object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) = updateBuffering()
        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) = updateBuffering()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityPlayerBinding.inflate(layoutInflater)
        setContentView(b.root)
        manager = PlaybackManager.get(this)
        wide = resources.getBoolean(R.bool.wide_layout)
        library = Library(this)
        b.playerFrame.setAspectRatio(16f / 9f)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        b.playerView.player = manager.player
        b.playerView.setFullscreenButtonClickListener { setFullscreen(it) }
        manager.player.addListener(bufferingListener)

        b.retry.setOnClickListener { manager.retry() }
        b.btnAudio.setOnClickListener { manager.setAudioOnly(b.btnAudio.isChecked) }
        b.btnQuality.setOnClickListener { chooseQuality() }
        b.btnPrev.setOnClickListener { manager.previous() }
        b.btnNext.setOnClickListener { manager.next() }
        b.queueInfo.setOnClickListener { showQueue() }
        b.btnSave.setOnClickListener {
            val item = manager.state.value.current ?: return@setOnClickListener
            updateSaveButton(library.toggleSaved(item))
        }
        b.btnMore.setOnClickListener { showMore() }
        b.btnDownload.setOnClickListener { chooseDownload() }
        b.descriptionToggle.setOnClickListener {
            descriptionExpanded = !descriptionExpanded
            b.description.maxLines = if (descriptionExpanded) Int.MAX_VALUE else 4
            b.descriptionToggle.setText(if (descriptionExpanded) R.string.less else R.string.more)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (fullscreen) {
                    setFullscreen(false)
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        lifecycleScope.launch { manager.state.collect { render(it) } }
        // Tras recrear la actividad (cambio de diseño) el vídeo ya está sonando.
        if (savedInstanceState == null || manager.state.value.current == null) handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val url = intent?.getStringExtra(EXTRA_URL) ?: return
        manager.playUrl(url)
    }

    private fun updateBuffering() {
        val p = manager.player
        val buffering = p.playbackState == Player.STATE_BUFFERING && p.playWhenReady
        b.loading.visibility = if (buffering || manager.state.value.loading) View.VISIBLE else View.GONE
    }

    private fun render(s: PlaybackState) {
        updateBuffering()
        b.error.text = s.error
        b.error.visibility = if (s.error != null) View.VISIBLE else View.GONE
        b.retry.visibility = b.error.visibility
        b.notice.text = s.notice
        b.notice.visibility = if (s.notice != null) View.VISIBLE else View.GONE

        val item = s.current
        b.title.text = item?.title?.ifBlank { "Cargando…" } ?: ""
        b.channel.text = item?.channel ?: ""
        b.channel.setOnClickListener { item?.channelUrl?.let { openChannel(this, it) } }
        item?.let { updateSaveButton(library.isSaved(it.url)) }

        b.btnAudio.isChecked = s.audioOnly
        b.btnQuality.text = if (s.height > 0) "${s.height}p" else getString(R.string.quality)
        b.btnQuality.contentDescription = getString(R.string.quality) + if (s.height > 0) ": ${s.height}p" else ""
        val showArt = s.audioOnly && item?.thumbnail != null
        b.artwork.visibility = if (showArt) View.VISIBLE else View.GONE
        if (showArt) b.artwork.load(item?.thumbnail)

        b.queueRow.visibility = if (s.queue.size > 1) View.VISIBLE else View.GONE
        b.btnPrev.isEnabled = s.hasPrevious
        b.btnNext.isEnabled = s.hasNext
        b.queueInfo.text = if (s.hasNext) "Siguiente: ${s.queue[s.index + 1].title.ifBlank { "…" }}\n(${s.index + 1} de ${s.queue.size} · ver cola)" else "${s.index + 1} de ${s.queue.size} · ver cola"

        val info = s.info
        if (info != null && shownInfoFor != info.url) {
            shownInfoFor = info.url
            val parts = listOfNotNull(
                if (info.viewCount >= 0) getString(R.string.views, formatCount(info.viewCount)) else null,
                info.textualUploadDate?.ifBlank { null },
                formatDuration(info.duration).ifBlank { null },
                if (info.subtitles.isNotEmpty()) "subtítulos" else null,
            )
            b.meta.text = parts.joinToString(" · ")
            val desc = info.description?.content().orEmpty()
            b.description.text = HtmlCompat.fromHtml(desc, HtmlCompat.FROM_HTML_MODE_COMPACT)
            b.descriptionToggle.visibility = if (desc.isBlank()) View.GONE else View.VISIBLE
            descriptionExpanded = false
            b.description.maxLines = 4
            b.btnQuality.isEnabled = !YtMedia.isLive(info)
            b.btnDownload.isEnabled = !YtMedia.isLive(info)
        } else if (info == null) {
            b.meta.text = ""
        }
    }

    private fun updateSaveButton(saved: Boolean) {
        b.btnSave.isChecked = saved
        b.btnSave.setText(if (saved) R.string.saved_done else R.string.save)
        b.btnSave.setIconResource(if (saved) R.drawable.ic_bookmark else R.drawable.ic_bookmark_outline)
    }

    private fun chooseQuality() {
        val info = manager.state.value.info ?: return
        val options = YtMedia.qualities(info)
        if (options.isEmpty()) return
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.quality)
            .setItems(options.map { "${it}p" }.toTypedArray()) { _, which -> manager.setMaxHeight(options[which]) }
            .show()
    }

    private fun chooseDownload() {
        val s = manager.state.value
        val info = s.info ?: return
        val url = s.current?.url ?: return
        val heights = YtMedia.downloadHeights(info)
        val labels = mutableListOf("MP3 (${library.mp3Bitrate} kbps)", "Audio original (M4A)")
        labels += heights.map { "Vídeo ${it}p (MP4)" }
        if (heights.isEmpty() && YtMedia.downloadMuxed(info) != null) labels += "Vídeo (MP4)"
        MaterialAlertDialogBuilder(this)
            .setTitle("Descargar")
            .setItems(labels.toTypedArray()) { _, which ->
                when {
                    which == 0 -> s.current?.let { VideoActions.downloadMp3(this, listOf(it)) }
                    which == 1 -> VideoActions.download(this, url, DownloadWorker.KIND_AUDIO, 0)
                    heights.isNotEmpty() -> VideoActions.download(this, url, DownloadWorker.KIND_VIDEO, heights[which - 2])
                    else -> VideoActions.download(this, url, DownloadWorker.KIND_VIDEO, 360)
                }
            }
            .show()
    }

    /** Acciones secundarias en una hoja inferior, al alcance del pulgar y con texto completo. */
    private fun showMore() {
        val s = manager.state.value
        val item = s.current ?: return
        val rows = mutableListOf<Triple<Int, String, () -> Unit>>(
            Triple(R.drawable.ic_playlist_add, getString(R.string.add_to_playlist)) { VideoActions.addToPlaylist(this, item) },
            Triple(R.drawable.ic_share, getString(R.string.share)) {
                startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, item.url), getString(R.string.share)))
            },
        )
        if (s.queue.size > 1) rows += Triple(R.drawable.ic_queue, getString(R.string.view_queue) + " (${s.queue.size})") { showQueue() }
        item.channelUrl?.let { url ->
            rows += Triple(R.drawable.ic_person, getString(R.string.go_to_channel) + if (item.channel.isNotBlank()) ": ${item.channel}" else "") { openChannel(this, url) }
        }
        val sheet = BottomSheetDialog(this)
        val dp = resources.displayMetrics.density
        val list = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, (8 * dp).toInt(), 0, (16 * dp).toInt())
        }
        val ripple = TypedValue().also { theme.resolveAttribute(android.R.attr.selectableItemBackground, it, true) }.resourceId
        val fg = getColor(R.color.fg)
        for ((icon, label, action) in rows) {
            list.addView(TextView(this).apply {
                text = label
                textSize = 16f
                setTextColor(fg)
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.END
                minHeight = (56 * dp).toInt()
                gravity = Gravity.CENTER_VERTICAL
                setPadding((24 * dp).toInt(), 0, (24 * dp).toInt(), 0)
                compoundDrawablePadding = (24 * dp).toInt()
                setCompoundDrawablesRelativeWithIntrinsicBounds(icon, 0, 0, 0)
                TextViewCompat.setCompoundDrawableTintList(this, ColorStateList.valueOf(fg))
                setBackgroundResource(ripple)
                setOnClickListener { sheet.dismiss(); action() }
            })
        }
        sheet.setContentView(list)
        sheet.show()
    }

    private fun showQueue() {
        val s = manager.state.value
        if (s.queue.isEmpty()) return
        val labels = s.queue.mapIndexed { i, v -> (if (i == s.index) "▶ " else "${i + 1}. ") + v.title.ifBlank { v.url } }
        MaterialAlertDialogBuilder(this)
            .setTitle("Cola de reproducción")
            .setItems(labels.toTypedArray()) { _, which -> manager.jumpTo(which) }
            .setNegativeButton("Vaciar y detener") { _, _ ->
                manager.stop()
                finish()
            }
            .show()
    }

    // ---- pantalla completa e imagen en imagen ----

    private fun setFullscreen(on: Boolean) {
        fullscreen = on
        requestedOrientation = if (on) ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        applyFullscreenLayout(on)
    }

    private fun applyFullscreenLayout(on: Boolean) {
        expandPlayer(on)
        // En pantalla completa el marco ocupa toda la pantalla (FILL) y es el PlayerView
        // quien ajusta y centra el vídeo; con FIT el marco se encogía y quedaba a la izquierda.
        b.playerFrame.resizeMode = if (on) AspectRatioFrameLayout.RESIZE_MODE_FILL else AspectRatioFrameLayout.RESIZE_MODE_FIXED_WIDTH
        b.playerView.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        WindowCompat.setDecorFitsSystemWindows(window, !on)
        b.root.fitsSystemWindows = !on
        if (on) {
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    /**
     * Pantalla completa válida para los dos diseños: desde el marco del vídeo hasta la raíz,
     * oculta los hermanos y estira cada contenedor; al salir restaura lo guardado.
     */
    private fun expandPlayer(on: Boolean) {
        if (on) {
            if (resizedForFullscreen.isNotEmpty()) return
            var child: View = b.playerFrame
            while (child !== b.root) {
                val parent = child.parent as ViewGroup
                for (i in 0 until parent.childCount) {
                    val v = parent.getChildAt(i)
                    if (v !== child) {
                        hiddenForFullscreen += v to v.visibility
                        v.visibility = View.GONE
                    }
                }
                val lp = child.layoutParams
                resizedForFullscreen += child to (if (lp is LinearLayout.LayoutParams) LinearLayout.LayoutParams(lp) else ViewGroup.LayoutParams(lp))
                lp.width = ViewGroup.LayoutParams.MATCH_PARENT
                lp.height = ViewGroup.LayoutParams.MATCH_PARENT
                if (lp is LinearLayout.LayoutParams) lp.weight = 0f
                child.layoutParams = lp
                child = parent
            }
        } else {
            hiddenForFullscreen.forEach { (v, visibility) -> v.visibility = visibility }
            hiddenForFullscreen.clear()
            resizedForFullscreen.forEach { (v, lp) -> v.layoutParams = lp }
            resizedForFullscreen.clear()
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        if (isInPictureInPictureMode) return
        // Si cambia el diseño que corresponde (tableta que gira), se recrea con el otro layout.
        if (resources.getBoolean(R.bool.wide_layout) != wide) {
            recreate()
            return
        }
        // En el diseño ancho ya se está en horizontal: la pantalla completa solo es manual.
        if (wide) return
        val landscape = newConfig.orientation == Configuration.ORIENTATION_LANDSCAPE
        if (landscape != fullscreen) {
            fullscreen = landscape
            applyFullscreenLayout(landscape)
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        val s = manager.state.value
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.player.isPlaying && !s.audioOnly) {
            runCatching {
                enterPictureInPictureMode(PictureInPictureParams.Builder().setAspectRatio(Rational(16, 9)).build())
            }
        }
        // Con «Solo audio» (o si no hay imagen en imagen) sigue sonando en segundo plano
        // con controles en la notificación.
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        b.playerView.useController = !isInPictureInPictureMode
        if (isInPictureInPictureMode) applyFullscreenLayout(true) else applyFullscreenLayout(fullscreen)
    }

    override fun onDestroy() {
        manager.player.removeListener(bufferingListener)
        b.playerView.player = null
        super.onDestroy()
    }

    companion object {
        const val EXTRA_URL = "url"
    }
}
