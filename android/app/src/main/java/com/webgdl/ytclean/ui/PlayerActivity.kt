package com.webgdl.ytclean.ui

import android.app.PictureInPictureParams
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.util.Rational
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import coil3.load
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.webgdl.ytclean.R
import com.webgdl.ytclean.data.Prefs
import com.webgdl.ytclean.data.VideoItem
import com.webgdl.ytclean.data.Yt
import com.webgdl.ytclean.databinding.ActivityPlayerBinding
import com.webgdl.ytclean.player.YtMedia
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.schabi.newpipe.extractor.stream.StreamInfo

/**
 * Reproductor nativo: extrae los flujos con NewPipeExtractor y los reproduce con
 * ExoPlayer. Sin anuncios, sin cuenta, sin el reproductor de YouTube.
 */
class PlayerActivity : AppCompatActivity() {
    private lateinit var b: ActivityPlayerBinding
    private lateinit var prefs: Prefs
    private var player: ExoPlayer? = null
    private var info: StreamInfo? = null
    private var url: String = ""
    private var maxHeight = 720
    private var audioOnly = false
    private var loadJob: Job? = null
    private var fullscreen = false
    private var descriptionExpanded = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityPlayerBinding.inflate(layoutInflater)
        setContentView(b.root)
        prefs = Prefs(this)
        maxHeight = prefs.quality
        audioOnly = prefs.audioOnly
        b.playerFrame.setAspectRatio(16f / 9f)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val exo = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(),
                true,
            )
            .setHandleAudioBecomingNoisy(true)
            .build()
        player = exo
        b.playerView.player = exo
        b.playerView.setFullscreenButtonClickListener { setFullscreen(it) }
        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                b.loading.visibility = if (state == Player.STATE_BUFFERING && exo.playWhenReady) View.VISIBLE else View.GONE
            }

            override fun onPlayerError(error: PlaybackException) {
                showError("Error de reproducción (${error.errorCodeName}). Las direcciones de YouTube caducan o cambian: pulsa Reintentar.")
            }
        })

        b.retry.setOnClickListener { load(url, keepPosition = true) }
        b.btnAudio.isChecked = audioOnly
        b.btnAudio.setOnClickListener {
            audioOnly = b.btnAudio.isChecked
            rebuild()
        }
        b.btnQuality.setOnClickListener { chooseQuality() }
        b.btnShare.setOnClickListener {
            startActivity(
                Intent.createChooser(
                    Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url),
                    getString(R.string.share),
                ),
            )
        }
        b.btnSave.setOnClickListener {
            val i = info ?: return@setOnClickListener
            val saved = prefs.toggleSaved(
                VideoItem(
                    url = url,
                    title = i.name,
                    channel = i.uploaderName ?: "",
                    channelUrl = i.uploaderUrl,
                    thumbnail = Yt.bestImage(i.thumbnails),
                    durationSeconds = i.duration,
                    views = -1,
                    uploaded = null,
                    isLive = false,
                ),
            )
            updateSaveButton(saved)
        }
        b.descriptionToggle.setOnClickListener {
            descriptionExpanded = !descriptionExpanded
            b.description.maxLines = if (descriptionExpanded) Int.MAX_VALUE else 4
            b.descriptionToggle.setText(if (descriptionExpanded) R.string.less else R.string.more)
        }

        load(intent.getStringExtra(EXTRA_URL) ?: return finish(), keepPosition = false)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_URL)?.let { load(it, keepPosition = false) }
    }

    private fun load(newUrl: String, keepPosition: Boolean) {
        url = newUrl
        val position = if (keepPosition) player?.currentPosition ?: 0 else 0
        loadJob?.cancel()
        hideError()
        b.loading.visibility = View.VISIBLE
        if (!keepPosition) {
            player?.stop()
            b.title.text = ""
            b.meta.text = ""
            b.channel.text = ""
            b.description.text = ""
            descriptionExpanded = false
            b.description.maxLines = 4
        }
        loadJob = lifecycleScope.launch {
            try {
                val i = withContext(Dispatchers.IO) { Yt.stream(newUrl) }
                info = i
                showInfo(i)
                play(i, if (keepPosition) position else i.startPosition * 1000)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                b.loading.visibility = View.GONE
                showError(errorMessage(e))
            }
        }
    }

    private suspend fun play(i: StreamInfo, positionMs: Long) {
        val (source, height) = withContext(Dispatchers.IO) { YtMedia.build(i, maxHeight, audioOnly) }
        val exo = player ?: return
        exo.setMediaSource(source, positionMs.coerceAtLeast(0))
        exo.prepare()
        exo.playWhenReady = true
        b.btnQuality.text = if (height > 0) "${height}p" else getString(R.string.quality)
        val showArt = audioOnly || height == 0
        b.artwork.visibility = if (showArt) View.VISIBLE else View.GONE
        if (showArt) b.artwork.load(Yt.bestImage(i.thumbnails, 720))
    }

    private fun rebuild() {
        val i = info ?: return
        val pos = player?.currentPosition ?: 0
        lifecycleScope.launch {
            try {
                play(i, pos)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                showError(errorMessage(e))
            }
        }
    }

    private fun showInfo(i: StreamInfo) {
        b.title.text = i.name
        val parts = listOfNotNull(
            if (i.viewCount >= 0) getString(R.string.views, formatCount(i.viewCount)) else null,
            i.textualUploadDate?.ifBlank { null },
            formatDuration(i.duration).ifBlank { null },
        )
        b.meta.text = parts.joinToString(" · ")
        b.channel.text = i.uploaderName ?: ""
        b.channel.setOnClickListener { i.uploaderUrl?.let { openChannel(this, it) } }
        val desc = i.description?.content().orEmpty()
        b.description.text = androidx.core.text.HtmlCompat.fromHtml(desc, androidx.core.text.HtmlCompat.FROM_HTML_MODE_COMPACT)
        b.descriptionToggle.visibility = if (desc.isBlank()) View.GONE else View.VISIBLE
        updateSaveButton(prefs.isSaved(url))
        b.btnQuality.isEnabled = !YtMedia.isLive(i)
    }

    private fun updateSaveButton(saved: Boolean) {
        b.btnSave.setText(if (saved) R.string.saved_done else R.string.save)
    }

    private fun chooseQuality() {
        val i = info ?: return
        val options = YtMedia.qualities(i)
        if (options.isEmpty()) return
        val labels = options.map { "${it}p" }.toTypedArray()
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.quality)
            .setItems(labels) { _, which ->
                maxHeight = options[which]
                if (audioOnly) {
                    audioOnly = false
                    b.btnAudio.isChecked = false
                }
                rebuild()
            }
            .show()
    }

    private fun showError(text: String) {
        b.error.text = text
        b.error.visibility = View.VISIBLE
        b.retry.visibility = View.VISIBLE
    }

    private fun hideError() {
        b.error.visibility = View.GONE
        b.retry.visibility = View.GONE
    }

    // ---- pantalla completa e imagen en imagen ----

    private fun setFullscreen(on: Boolean) {
        fullscreen = on
        requestedOrientation = if (on) ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        applyFullscreenLayout(on)
    }

    private fun applyFullscreenLayout(on: Boolean) {
        b.details.visibility = if (on) View.GONE else View.VISIBLE
        val lp = b.playerFrame.layoutParams
        lp.height = if (on) ViewGroup.LayoutParams.MATCH_PARENT else ViewGroup.LayoutParams.WRAP_CONTENT
        b.playerFrame.layoutParams = lp
        b.playerFrame.resizeMode = if (on) AspectRatioFrameLayout.RESIZE_MODE_FIT else AspectRatioFrameLayout.RESIZE_MODE_FIXED_WIDTH
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

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        if (isInPictureInPictureMode) return
        val landscape = newConfig.orientation == Configuration.ORIENTATION_LANDSCAPE
        if (landscape != fullscreen) {
            fullscreen = landscape
            applyFullscreenLayout(landscape)
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        val exo = player ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && exo.isPlaying && !audioOnly) {
            runCatching {
                enterPictureInPictureMode(PictureInPictureParams.Builder().setAspectRatio(Rational(16, 9)).build())
            }
        }
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        b.playerView.useController = !isInPictureInPictureMode
        if (isInPictureInPictureMode) {
            b.details.visibility = View.GONE
        } else {
            applyFullscreenLayout(fullscreen)
        }
    }

    override fun onStop() {
        super.onStop()
        // En imagen en imagen o con «Solo audio» se sigue reproduciendo mientras la app está visible en PiP;
        // fuera de eso, se pausa: la app no reproduce ni trabaja en segundo plano.
        if (!isInPictureInPictureMode && !audioOnly) player?.pause()
    }

    override fun onDestroy() {
        super.onDestroy()
        player?.release()
        player = null
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (fullscreen) {
            setFullscreen(false)
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    companion object {
        const val EXTRA_URL = "url"
    }
}
