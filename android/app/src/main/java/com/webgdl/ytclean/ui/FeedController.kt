package com.webgdl.ytclean.ui

import android.view.View
import android.widget.TextView
import androidx.lifecycle.LifecycleCoroutineScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.webgdl.ytclean.data.Feed
import com.webgdl.ytclean.data.VideoItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Carga una [Feed] en una lista con paginación al desplazarse. */
class FeedController(
    private val scope: LifecycleCoroutineScope,
    list: RecyclerView,
    private val progress: View,
    private val message: TextView,
    private val emptyText: String,
    onLongClick: ((VideoItem) -> Unit)? = null,
    onClick: ((VideoItem, List<VideoItem>) -> Unit)? = null,
) {
    private val adapter = VideoAdapter(
        onClick = { item -> if (onClick != null) onClick(item, items) else openVideo(list.context, item.url) },
        onLongClick = { item -> if (onLongClick != null) onLongClick(item) else VideoActions.show(list.context, item) },
    )
    private var feed: Feed? = null
    private var items = emptyList<VideoItem>()
    private var job: Job? = null
    private var loadingMore = false

    init {
        list.layoutManager = LinearLayoutManager(list.context)
        list.adapter = adapter
        list.onNearEnd { loadMore() }
    }

    fun show(newFeed: Feed) {
        job?.cancel()
        feed = newFeed
        items = emptyList()
        adapter.submitList(items)
        message.visibility = View.GONE
        progress.visibility = View.VISIBLE
        loadingMore = false
        job = scope.launch {
            try {
                val first = withContext(Dispatchers.IO) { newFeed.first() }
                items = first
                adapter.submitList(items)
                if (first.isEmpty()) showMessage(emptyText)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                showMessage(errorMessage(e))
            } finally {
                progress.visibility = View.GONE
            }
        }
    }

    fun showItems(list: List<VideoItem>) {
        job?.cancel()
        feed = null
        items = list
        adapter.submitList(list)
        if (list.isEmpty()) showMessage(emptyText) else message.visibility = View.GONE
    }

    private fun loadMore() {
        val f = feed ?: return
        if (loadingMore || !f.hasMore) return
        loadingMore = true
        scope.launch {
            try {
                val more = withContext(Dispatchers.IO) { f.next() }
                if (feed === f) {
                    val seen = items.map { it.url }.toHashSet()
                    items = items + more.filter { seen.add(it.url) }
                    adapter.submitList(items)
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
            } finally {
                loadingMore = false
            }
        }
    }

    private fun showMessage(text: String) {
        message.text = text
        message.visibility = View.VISIBLE
    }
}
