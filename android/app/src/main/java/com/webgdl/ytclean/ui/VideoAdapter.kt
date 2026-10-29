package com.webgdl.ytclean.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil3.load
import com.webgdl.ytclean.R
import com.webgdl.ytclean.data.VideoItem
import com.webgdl.ytclean.databinding.ItemVideoBinding

class VideoAdapter(
    private val onClick: (VideoItem) -> Unit,
    private val onLongClick: (VideoItem) -> Unit,
) : ListAdapter<VideoItem, VideoAdapter.Holder>(Diff) {

    class Holder(val b: ItemVideoBinding) : RecyclerView.ViewHolder(b.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val b = ItemVideoBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        b.thumbFrame.setAspectRatio(16f / 9f)
        b.thumbFrame.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIXED_WIDTH
        return Holder(b)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val item = getItem(position)
        val b = holder.b
        val ctx = b.root.context
        b.title.text = item.title
        val parts = listOfNotNull(
            item.channel.ifBlank { null },
            if (item.views >= 0) ctx.getString(R.string.views, formatCount(item.views)) else null,
            item.uploaded?.ifBlank { null },
        )
        b.meta.text = parts.joinToString(" · ")
        val badge = if (item.isLive) ctx.getString(R.string.live) else formatDuration(item.durationSeconds)
        b.duration.text = badge
        b.duration.visibility = if (badge.isEmpty()) View.GONE else View.VISIBLE
        b.thumb.load(item.thumbnail)
        b.root.setOnClickListener { onClick(item) }
        b.root.setOnLongClickListener {
            onLongClick(item)
            true
        }
    }

    private object Diff : DiffUtil.ItemCallback<VideoItem>() {
        override fun areItemsTheSame(a: VideoItem, b: VideoItem) = a.url == b.url
        override fun areContentsTheSame(a: VideoItem, b: VideoItem) = a == b
    }
}

/** Lanza [onEnd] cuando el usuario se acerca al final de la lista. */
fun RecyclerView.onNearEnd(onEnd: () -> Unit) {
    addOnScrollListener(object : RecyclerView.OnScrollListener() {
        override fun onScrolled(rv: RecyclerView, dx: Int, dy: Int) {
            if (dy <= 0) return
            val lm = rv.layoutManager as? androidx.recyclerview.widget.LinearLayoutManager ?: return
            if (lm.findLastVisibleItemPosition() >= (rv.adapter?.itemCount ?: 0) - 4) onEnd()
        }
    })
}
