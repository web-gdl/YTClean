package com.webgdl.ytclean.ui

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.webgdl.ytclean.R
import com.webgdl.ytclean.data.Prefs
import com.webgdl.ytclean.data.Yt
import com.webgdl.ytclean.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {
    private lateinit var b: ActivityMainBinding
    private lateinit var feed: FeedController

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)

        feed = FeedController(lifecycleScope, b.list, b.progress, b.message, getString(R.string.no_results))

        b.toolbar.inflateMenu(R.menu.main)
        b.toolbar.setOnMenuItemClickListener {
            when (it.itemId) {
                R.id.action_saved -> startActivity(Intent(this, SavedActivity::class.java))
                R.id.action_settings -> showSettings()
            }
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

        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
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
        hideKeyboard()
        val url = firstUrl(query)
        if (url != null && openYoutubeLink(this, url)) return
        feed.show(Yt.search(query))
    }

    private fun hideKeyboard() {
        getSystemService(InputMethodManager::class.java)?.hideSoftInputFromWindow(b.searchInput.windowToken, 0)
        b.searchInput.clearFocus()
    }

    private fun showSettings() {
        val prefs = Prefs(this)
        val qualities = intArrayOf(360, 480, 720, 1080, 1440, 2160)
        val labels = qualities.map { "${it}p" }.toTypedArray()
        val current = qualities.indexOf(prefs.quality).coerceAtLeast(0)
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.settings_quality)
            .setSingleChoiceItems(labels, current) { d, which ->
                prefs.quality = qualities[which]
                d.dismiss()
            }
            .setNeutralButton(if (prefs.audioOnly) "Solo audio: sí" else "Solo audio: no") { _, _ ->
                prefs.audioOnly = !prefs.audioOnly
                Toast.makeText(this, if (prefs.audioOnly) "Solo audio por defecto" else "Vídeo por defecto", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton(R.string.settings_clear) { _, _ ->
                prefs.clearAll()
                Toast.makeText(this, R.string.settings_cleared, Toast.LENGTH_SHORT).show()
            }
            .setMessage(R.string.about)
            .show()
    }
}
