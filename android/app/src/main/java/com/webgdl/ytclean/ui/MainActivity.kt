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
import androidx.core.widget.doAfterTextChanged
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
    /** true mientras la pantalla de inicio muestra el historial en vez de resultados. */
    private var showingRecent = true

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

        b.recentAll.setOnClickListener { LibraryListActivity.open(this, LibraryListActivity.MODE_HISTORY) }
        b.recentEnable.setOnClickListener {
            Library(this).keepHistory = true
            showRecent()
        }
        // Al borrar el texto del buscador se vuelve al historial.
        b.searchInput.doAfterTextChanged { if (it.isNullOrEmpty() && !showingRecent) showRecent() }

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
        if (savedInstanceState == null && intent?.action == Intent.ACTION_MAIN) offerDefaultLinks()
    }

    override fun onResume() {
        super.onResume()
        Yt.hideShorts = Library(this).hideShorts
        // Al volver del reproductor o de Ajustes, el historial puede haber cambiado.
        if (showingRecent) showRecent()
    }

    /** Pantalla de inicio sin búsqueda: últimos vídeos vistos (o cómo activar el historial). */
    private fun showRecent() {
        showingRecent = true
        val lib = Library(this)
        b.recentHeader.visibility = View.VISIBLE
        if (!lib.keepHistory) {
            search.showItems(emptyList())
            b.recentAll.visibility = View.GONE
            b.recentEnable.visibility = View.VISIBLE
            b.message.text = "El historial está desactivado. Actívalo para ver aquí lo último que viste. Solo se guarda en este teléfono."
            return
        }
        b.recentEnable.visibility = View.GONE
        val items = lib.history().take(RECENT_COUNT)
        search.showItems(items)
        b.recentAll.visibility = if (lib.history().size > items.size) View.VISIBLE else View.GONE
        if (items.isEmpty()) b.message.text = getString(R.string.empty_home) + "\n\nAquí verás los últimos vídeos que reproduzcas."
    }

    /** Pasa de historial a resultados. */
    private fun leaveRecent() {
        showingRecent = false
        b.recentHeader.visibility = View.GONE
        b.recentEnable.visibility = View.GONE
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
        val raw = when (intent?.action) {
            Intent.ACTION_SEND -> intent.getStringExtra(Intent.EXTRA_TEXT)?.let { text -> firstUrl(text) ?: text.trim().ifBlank { null }?.also { runSearch(it); return } }
            Intent.ACTION_VIEW -> intent.dataString
            else -> null
        } ?: return
        val url = YoutubeLinks.normalize(raw)
        if (openYoutubeLink(this, url)) return
        YoutubeLinks.searchQuery(url)?.let { runSearch(it); return }
        // Otras páginas de YouTube (inicio, tendencias…): se queda en la portada de YT Clean.
        if (!YoutubeLinks.isYoutubeHost(url)) {
            Toast.makeText(this, "Ese enlace no es de YouTube", Toast.LENGTH_LONG).show()
        }
    }

    /** Busca un texto (enlaces de búsqueda o texto compartido sin enlace). */
    private fun runSearch(query: String) {
        b.bottomNav.selectedItemId = R.id.nav_home
        b.searchInput.setText(query)
        leaveRecent()
        search.show(Yt.search(query))
    }

    /**
     * Una sola vez (Android 12+): ofrece activar YT Clean para abrir los enlaces de YouTube,
     * que Android no permite activar desde la propia app.
     */
    private fun offerDefaultLinks() {
        val prefs = getSharedPreferences(Library.NAME, MODE_PRIVATE)
        if (prefs.getBoolean("links_offered", false)) return
        val status = YoutubeLinks.defaultStatus(this) ?: return
        if (status.first >= status.second) return
        prefs.edit().putBoolean("links_offered", true).apply()
        com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setTitle("Abrir enlaces de YouTube con YT Clean")
            .setMessage("Para que los enlaces de YouTube (de WhatsApp, el navegador, etc.) se abran aquí sin preguntar, Android pide activarlo una vez en sus ajustes.\n\n" + YoutubeLinks.instructions() + "\n\nTambién está en Ajustes → Enlaces de YouTube.")
            .setPositiveButton("Activar") { _, _ -> YoutubeLinks.openSettings(this) }
            .setNegativeButton("Ahora no", null)
            .show()
    }

    private fun submit(raw: String) {
        val query = raw.trim()
        if (query.isEmpty()) return
        getSystemService(InputMethodManager::class.java)?.hideSoftInputFromWindow(b.searchInput.windowToken, 0)
        b.searchInput.clearFocus()
        val url = firstUrl(query)?.let { YoutubeLinks.normalize(it) }
        if (url != null && openYoutubeLink(this, url)) return
        url?.let { YoutubeLinks.searchQuery(it) }?.let { runSearch(it); return }
        leaveRecent()
        search.show(Yt.search(query))
    }

    private companion object {
        /** Vídeos del historial en la pantalla de inicio (el resto, en «Ver todo»). */
        const val RECENT_COUNT = 30
    }
}
