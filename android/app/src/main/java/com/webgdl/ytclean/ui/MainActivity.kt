package com.webgdl.ytclean.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.webgdl.ytclean.R
import com.webgdl.ytclean.data.Library
import com.webgdl.ytclean.data.Yt
import com.webgdl.ytclean.databinding.ActivityMainBinding
import com.webgdl.ytclean.player.PlaybackManager
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    private lateinit var b: ActivityMainBinding
    private lateinit var search: FeedController
    private lateinit var subs: FeedController
    private var subsLoaded = false

    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)

        search = FeedController(lifecycleScope, b.list, b.progress, b.message, getString(R.string.no_results))
        subs = FeedController(lifecycleScope, b.subsList, b.subsProgress, b.subsMessage, "Sin novedades.")

        b.toolbar.inflateMenu(R.menu.main)
        b.toolbar.setOnMenuItemClickListener {
            when (it.itemId) {
                R.id.action_settings -> startActivity(Intent(this, SettingsActivity::class.java))
                R.id.action_refresh -> loadSubscriptions()
            }
            true
        }

        b.bottomNav.setOnItemSelectedListener { item ->
            showPane(item.itemId)
            true
        }

        b.searchInput.setOnEditorActionListener { _, actionId, event ->
            val enter = event?.keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_DOWN
            if (actionId == EditorInfo.IME_ACTION_SEARCH || enter) {
                submit(b.searchInput.text?.toString().orEmpty())
                true
            } else {
                false
            }
        }

        b.libSaved.setOnClickListener { LibraryListActivity.open(this, LibraryListActivity.MODE_SAVED) }
        b.libHistory.setOnClickListener { LibraryListActivity.open(this, LibraryListActivity.MODE_HISTORY) }
        b.libPlaylists.setOnClickListener { SimpleListActivity.open(this, SimpleListActivity.MODE_PLAYLISTS) }
        b.libChannels.setOnClickListener { SimpleListActivity.open(this, SimpleListActivity.MODE_CHANNELS) }
        b.libDownloads.setOnClickListener { SimpleListActivity.open(this, SimpleListActivity.MODE_DOWNLOADS) }
        b.libNowPlaying.setOnClickListener { startActivity(Intent(this, PlayerActivity::class.java)) }

        // Notificación con controles de reproducción y progreso de descargas (Android 13+).
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        lifecycleScope.launch {
            PlaybackManager.get(this@MainActivity).state.collect { s ->
                b.libNowPlaying.visibility = if (s.current != null) View.VISIBLE else View.GONE
                b.libNowPlaying.text = "Reproduciendo: ${s.current?.title?.ifBlank { "…" } ?: ""}"
            }
        }

        handleIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        Yt.hideShorts = Library(this).hideShorts
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun showPane(id: Int) {
        b.paneHome.visibility = if (id == R.id.nav_home) View.VISIBLE else View.GONE
        b.paneSubs.visibility = if (id == R.id.nav_subs) View.VISIBLE else View.GONE
        b.paneLibrary.visibility = if (id == R.id.nav_library) View.VISIBLE else View.GONE
        b.toolbar.menu.findItem(R.id.action_refresh)?.isVisible = id == R.id.nav_subs
        b.toolbar.title = when (id) {
            R.id.nav_subs -> "Suscripciones"
            R.id.nav_library -> "Biblioteca"
            else -> getString(R.string.app_name)
        }
        if (id == R.id.nav_subs && !subsLoaded) loadSubscriptions()
    }

    private fun loadSubscriptions() {
        val channels = Library(this).subscriptions()
        if (channels.isEmpty()) {
            subs.showItems(emptyList())
            b.subsMessage.text = "Aún no sigues ningún canal. Abre un canal y pulsa «Suscribirse»: se guarda solo en este teléfono, sin cuenta."
            b.subsMessage.visibility = View.VISIBLE
            return
        }
        subsLoaded = true
        b.subsProgress.visibility = View.VISIBLE
        b.subsMessage.visibility = View.GONE
        lifecycleScope.launch {
            try {
                val (items, failed) = Yt.subscriptionFeed(channels.map { it.url })
                subs.showItems(items)
                if (failed > 0) {
                    Toast.makeText(this@MainActivity, "No se pudieron cargar $failed de ${channels.size} canales", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                b.subsMessage.text = errorMessage(e)
                b.subsMessage.visibility = View.VISIBLE
            } finally {
                b.subsProgress.visibility = View.GONE
            }
        }
    }

    /** Enlaces compartidos o abiertos con la app. */
    private fun handleIntent(intent: Intent?) {
        val url = when (intent?.action) {
            Intent.ACTION_SEND -> firstUrl(intent.getStringExtra(Intent.EXTRA_TEXT))
            Intent.ACTION_VIEW -> intent.dataString
            else -> null
        } ?: return
        if (!openYoutubeLink(this, url)) Toast.makeText(this, "Ese enlace no es un vídeo ni un canal de YouTube", Toast.LENGTH_LONG).show()
    }

    private fun submit(raw: String) {
        val query = raw.trim()
        if (query.isEmpty()) return
        getSystemService(InputMethodManager::class.java)?.hideSoftInputFromWindow(b.searchInput.windowToken, 0)
        b.searchInput.clearFocus()
        val url = firstUrl(query)
        if (url != null && openYoutubeLink(this, url)) return
        search.show(Yt.search(query))
    }
}
