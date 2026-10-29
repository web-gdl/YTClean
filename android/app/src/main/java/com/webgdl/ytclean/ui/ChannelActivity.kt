package com.webgdl.ytclean.ui

import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import coil3.load
import com.webgdl.ytclean.R
import com.webgdl.ytclean.data.Yt
import com.webgdl.ytclean.databinding.ActivityListBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ChannelActivity : AppCompatActivity() {
    private lateinit var b: ActivityListBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityListBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.toolbar.setNavigationOnClickListener { finish() }
        val url = intent.getStringExtra(EXTRA_URL) ?: return finish()
        val controller = FeedController(lifecycleScope, b.list, b.progress, b.message, "Este canal no tiene vídeos públicos.")

        b.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val (info, feed) = withContext(Dispatchers.IO) { Yt.channel(url) }
                b.toolbar.title = info.name
                b.header.visibility = View.VISIBLE
                b.headerTitle.text = info.name
                b.headerSub.text = if (info.subscriberCount >= 0) getString(R.string.subscribers, formatCount(info.subscriberCount)) else ""
                b.avatar.load(Yt.bestImage(info.avatars, 176))
                controller.show(feed)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                b.progress.visibility = View.GONE
                b.message.text = errorMessage(e)
                b.message.visibility = View.VISIBLE
            }
        }
    }

    companion object {
        const val EXTRA_URL = "url"
    }
}

class SavedActivity : AppCompatActivity() {
    private lateinit var b: ActivityListBinding
    private lateinit var controller: FeedController

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityListBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.toolbar.title = getString(R.string.saved)
        b.toolbar.setNavigationOnClickListener { finish() }
        controller = FeedController(lifecycleScope, b.list, b.progress, b.message, getString(R.string.saved_empty))
    }

    override fun onResume() {
        super.onResume()
        controller.showItems(com.webgdl.ytclean.data.Prefs(this).saved())
    }
}

