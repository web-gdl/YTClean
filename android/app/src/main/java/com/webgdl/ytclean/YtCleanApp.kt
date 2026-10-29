package com.webgdl.ytclean

import android.app.Application
import com.webgdl.ytclean.data.Library
import com.webgdl.ytclean.data.Yt
import com.webgdl.ytclean.net.DownloaderImpl
import com.webgdl.ytclean.potoken.PoTokenProviderImpl
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.localization.Localization
import org.schabi.newpipe.extractor.services.youtube.extractors.YoutubeStreamExtractor
import java.util.Locale

class YtCleanApp : Application() {
    override fun onCreate() {
        super.onCreate()
        instance = this
        val library = Library(this)
        val country = library.region.ifBlank { Yt.deviceCountry() }
        NewPipe.init(
            DownloaderImpl.init(),
            Localization.fromLocale(Locale.getDefault()),
            ContentCountry(country),
        )
        // Tokens de integridad (BotGuard) generados en un WebView local, como NewPipe.
        YoutubeStreamExtractor.setPoTokenProvider(PoTokenProviderImpl)
        Yt.hideShorts = library.hideShorts
    }

    companion object {
        lateinit var instance: YtCleanApp
            private set
    }
}
