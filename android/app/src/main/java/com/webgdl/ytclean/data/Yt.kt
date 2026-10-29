package com.webgdl.ytclean.data

import org.schabi.newpipe.extractor.Image
import org.schabi.newpipe.extractor.InfoItem
import org.schabi.newpipe.extractor.Page
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.StreamingService
import org.schabi.newpipe.extractor.channel.ChannelInfo
import org.schabi.newpipe.extractor.channel.tabs.ChannelTabInfo
import org.schabi.newpipe.extractor.channel.tabs.ChannelTabs
import org.schabi.newpipe.extractor.linkhandler.ListLinkHandler
import org.schabi.newpipe.extractor.search.SearchInfo
import org.schabi.newpipe.extractor.linkhandler.SearchQueryHandler
import org.schabi.newpipe.extractor.services.youtube.linkHandler.YoutubeSearchQueryHandlerFactory
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.StreamInfoItem
import org.schabi.newpipe.extractor.stream.StreamType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlin.math.abs

/** Vídeo en una lista (búsqueda, canal, guardados). */
data class VideoItem(
    val url: String,
    val title: String,
    val channel: String,
    val channelUrl: String?,
    val thumbnail: String?,
    val durationSeconds: Long,
    val views: Long,
    val uploaded: String?,
    val isLive: Boolean,
    val isShort: Boolean = false,
    /** Fecha de publicación (ms) cuando se conoce; para ordenar el feed. */
    val uploadedAt: Long = -1,
)

/** Fuente paginada de vídeos. */
interface Feed {
    val hasMore: Boolean
    /** Primera página (llamar en un hilo de fondo). */
    fun first(): List<VideoItem>
    /** Página siguiente o lista vacía si no hay más. */
    fun next(): List<VideoItem>
}

object Yt {
    val service: StreamingService get() = ServiceList.YouTube

    fun isVideoUrl(url: String): Boolean = runCatching { service.streamLHFactory.acceptUrl(url) }.getOrDefault(false)
    fun isChannelUrl(url: String): Boolean = runCatching { service.channelLHFactory.acceptUrl(url) }.getOrDefault(false)

    fun stream(url: String): StreamInfo = StreamInfo.getInfo(service, url)

    fun videoId(url: String): String? = runCatching { service.streamLHFactory.getId(url) }.getOrNull()

    /** Si se activan en Ajustes, se ocultan los Shorts de todas las listas. */
    @Volatile
    var hideShorts: Boolean = true

    /**
     * Novedades de los canales suscritos: la pestaña «Vídeos» de cada canal (no
     * incluye Shorts), en paralelo con un máximo de 4 peticiones a la vez.
     */
    suspend fun subscriptionFeed(channelUrls: List<String>): Pair<List<VideoItem>, Int> = coroutineScope {
        val io = Dispatchers.IO.limitedParallelism(4)
        val results = channelUrls.map { url ->
            async(io) {
                runCatching {
                    val id = service.channelLHFactory.getId(url)
                    val extractor = service.getChannelTabExtractorFromId(id, ChannelTabs.VIDEOS)
                    extractor.fetchPage()
                    toItems(ChannelTabInfo.getInfo(extractor).relatedItems).take(15)
                }
            }
        }.awaitAll()
        val failed = results.count { it.isFailure }
        val items = results.flatMap { it.getOrDefault(emptyList()) }
            .distinctBy { it.url }
            .sortedByDescending { it.uploadedAt }
            .take(300)
        items to failed
    }

    fun search(query: String): Feed = SearchFeed(query)

    fun channel(url: String): Pair<ChannelInfo, Feed> {
        val info = ChannelInfo.getInfo(service, url)
        val tab = info.tabs.firstOrNull { it.contentFilters.contains(ChannelTabs.VIDEOS) } ?: info.tabs.firstOrNull()
        return info to (if (tab != null) ChannelTabFeed(tab) else EmptyFeed)
    }

    fun bestImage(images: List<Image>, targetHeight: Int = 360): String? =
        images.minByOrNull { abs((if (it.height > 0) it.height else targetHeight) - targetHeight) }?.url

    fun toItems(items: List<InfoItem>): List<VideoItem> = items.filterIsInstance<StreamInfoItem>().map { s ->
        val short = s.isShortFormContent || s.url.contains("/shorts/")
        VideoItem(
            url = s.url,
            title = s.name,
            channel = s.uploaderName ?: "",
            channelUrl = s.uploaderUrl,
            thumbnail = bestImage(s.thumbnails),
            durationSeconds = s.duration,
            views = s.viewCount,
            uploaded = s.textualUploadDate,
            isLive = s.streamType == StreamType.LIVE_STREAM || s.streamType == StreamType.AUDIO_LIVE_STREAM,
            isShort = short,
            uploadedAt = runCatching { s.uploadDate?.offsetDateTime()?.toInstant()?.toEpochMilli() }.getOrNull() ?: -1,
        )
    }.filter { !(hideShorts && it.isShort) }

    private object EmptyFeed : Feed {
        override val hasMore = false
        override fun first() = emptyList<VideoItem>()
        override fun next() = emptyList<VideoItem>()
    }

    private class SearchFeed(query: String) : Feed {
        private val handler: SearchQueryHandler = service.searchQHFactory
            .fromQuery(query, listOf(YoutubeSearchQueryHandlerFactory.VIDEOS), "")
        private var page: Page? = null
        override val hasMore get() = Page.isValid(page)

        override fun first(): List<VideoItem> {
            val info = SearchInfo.getInfo(service, handler)
            page = info.nextPage
            return toItems(info.relatedItems)
        }

        override fun next(): List<VideoItem> {
            val p = page ?: return emptyList()
            val more = SearchInfo.getMoreItems(service, handler, p)
            page = more.nextPage
            return toItems(more.items)
        }
    }

    private class ChannelTabFeed(private val tab: ListLinkHandler) : Feed {
        private var page: Page? = null
        override val hasMore get() = Page.isValid(page)

        override fun first(): List<VideoItem> {
            val info = ChannelTabInfo.getInfo(service, tab)
            page = info.nextPage
            return toItems(info.relatedItems)
        }

        override fun next(): List<VideoItem> {
            val p = page ?: return emptyList()
            val more = ChannelTabInfo.getMoreItems(service, tab, p)
            page = more.nextPage
            return toItems(more.items)
        }
    }
}
