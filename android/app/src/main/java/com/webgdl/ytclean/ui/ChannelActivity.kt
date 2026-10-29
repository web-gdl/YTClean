package com.webgdl.ytclean.ui

import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import coil3.load
import com.webgdl.ytclean.R
import com.webgdl.ytclean.data.Channel
import com.webgdl.ytclean.data.Library
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
        val library = Library(this)
        val controller = FeedController(lifecycleScope, b.list, b.progress, b.message, "Este canal no tiene vídeos públicos.")

        b.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val (info, feed) = withContext(Dispatchers.IO) { Yt.channel(url) }
                b.toolbar.title = info.name
                b.header.visibility = View.VISIBLE
                b.headerTitle.text = info.name
                b.headerSub.text = if (info.subscriberCount >= 0) getString(R.string.subscribers, formatCount(info.subscriberCount)) else ""
                val avatar = Yt.bestImage(info.avatars, 176)
                b.avatar.load(avatar)
                val channel = Channel(info.url, info.name, avatar)
                fun label() = if (library.isSubscribed(channel.url)) "Suscrito" else "Suscribirse"
                b.headerAction.visibility = View.VISIBLE
                b.headerAction.text = label()
                b.headerAction.setOnClickListener {
                    library.toggleSubscription(channel)
                    b.headerAction.text = label()
                }
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
