package com.webgdl.ytclean.cast

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import java.io.IOException
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.net.URI
import java.net.URLEncoder

/** Una Roku de la red local. */
data class RokuDevice(val ip: String, val name: String)

/** Error de la Roku con su código HTTP (403 = control por apps móviles desactivado). */
class RokuException(message: String, val code: Int = 0) : IOException(message)

/**
 * Envío de vídeos a una Roku con su protocolo de control local (ECP, puerto 8060), como el
 * proyecto Roku Control: descubrimiento SSDP y peticiones HTTP solo a IPv4 privadas.
 * Se usan sockets directos (no HttpURLConnection) para no tener que permitir HTTP sin cifrar
 * al resto de la app.
 */
object Roku {
    private const val PORT = 8060
    /** ID de la app de YouTube en la tienda de Roku. */
    private const val YOUTUBE_APP = "837"
    /** Canal integrado «Play on Roku»: reproduce una URL de vídeo con el reproductor de la Roku. */
    private const val PLAY_ON_ROKU = "15985"

    private val M_SEARCH = "M-SEARCH * HTTP/1.1\r\nHost: 239.255.255.250:1900\r\nMan: \"ssdp:discover\"\r\nST: roku:ecp\r\nMX: 2\r\n\r\n"

    /** Busca Roku durante [durationMs] (bloqueante; llamar en un hilo de fondo). */
    fun discover(context: Context, durationMs: Long = 3000): List<RokuDevice> {
        val wifi = context.applicationContext.getSystemService(WifiManager::class.java)
        val lock = wifi?.createMulticastLock("ytclean-roku")?.apply { setReferenceCounted(false); acquire() }
        val ips = LinkedHashSet<String>()
        try {
            DatagramSocket().use { socket ->
                lan(context)?.bindSocket(socket)
                socket.soTimeout = 400
                val msg = M_SEARCH.toByteArray(Charsets.US_ASCII)
                val group = InetAddress.getByName("239.255.255.250")
                val end = System.currentTimeMillis() + durationMs
                var nextSend = 0L
                val buf = ByteArray(1500)
                while (System.currentTimeMillis() < end) {
                    if (System.currentTimeMillis() >= nextSend) {
                        socket.send(DatagramPacket(msg, msg.size, group, 1900))
                        nextSend = System.currentTimeMillis() + 1200
                    }
                    val p = DatagramPacket(buf, buf.size)
                    try {
                        socket.receive(p)
                    } catch (_: SocketTimeoutException) {
                        continue
                    }
                    parseSsdp(String(p.data, 0, p.length, Charsets.US_ASCII))?.let { ips += it }
                }
            }
        } finally {
            runCatching { lock?.release() }
        }
        return ips.map { ip -> RokuDevice(ip, runCatching { name(context, ip) }.getOrDefault("Roku ($ip)")) }
    }

    /** IP de la cabecera LOCATION de una respuesta SSDP de Roku (o null). */
    fun parseSsdp(text: String): String? {
        val lines = text.split(Regex("\r?\n"))
        if (lines.firstOrNull()?.startsWith("HTTP/1.1 200") != true) return null
        var roku = false
        var location: String? = null
        for (line in lines) {
            val i = line.indexOf(':')
            if (i <= 0) continue
            val k = line.substring(0, i).trim().lowercase()
            val v = line.substring(i + 1).trim()
            if (k == "st" && v == "roku:ecp") roku = true
            if (k == "location") location = v
        }
        if (!roku || location == null) return null
        val host = runCatching { URI(location).host }.getOrNull() ?: return null
        return host.takeIf { isLocalIpv4(it) }
    }

    /** Nombre visible de la Roku (el que le puso el usuario o el modelo). */
    fun name(context: Context, ip: String): String {
        val xml = request(context, ip, "GET", "/query/device-info")
        fun tag(t: String) = Regex("<$t>([^<]*)</$t>").find(xml)?.groupValues?.get(1)?.trim()?.ifBlank { null }
        return tag("user-device-name") ?: tag("friendly-device-name") ?: tag("model-name")?.let { "$it ($ip)" } ?: "Roku ($ip)"
    }

    /**
     * Abre el vídeo en la app de YouTube de la Roku. Si esa app estaba cerrada, al arrancar se
     * queda en «Agregar una cuenta» / «Mirar como invitado» y descarta el vídeo: entonces entra
     * como invitado con las teclas del control (Abajo → OK) y vuelve a enviar el vídeo, ya con
     * la app abierta. Antes de cada pulsación comprueba si ya se reproduce, para no tocar un
     * vídeo en curso. Bloqueante (hasta ~30 s). Devuelve true si la Roku confirma que reproduce
     * (o si la app ya estaba abierta); [onStatus] informa del paso actual.
     */
    fun openInYoutube(context: Context, ip: String, videoId: String, guest: Boolean = true, onStatus: (String) -> Unit = {}): Boolean {
        val launch = "/launch/$YOUTUBE_APP?contentId=${enc(videoId)}&mediaType=movie"
        val wasOpen = activeApp(context, ip) == YOUTUBE_APP
        request(context, ip, "POST", launch)
        if (!guest || wasOpen) return true
        onStatus("Abriendo YouTube en la Roku…")
        // Arranque en frío: 5-10 s en muchas Roku hasta que YouTube es la app activa.
        val deadline = System.currentTimeMillis() + 15_000
        while (activeApp(context, ip) != YOUTUBE_APP && System.currentTimeMillis() < deadline) Thread.sleep(500)
        Thread.sleep(5000)
        repeat(2) {
            if (isPlaying(context, ip)) return true
            onStatus("Entrando como invitado en YouTube de la Roku…")
            key(context, ip, "Down")
            Thread.sleep(700)
            key(context, ip, "Select")
            Thread.sleep(3500)
            request(context, ip, "POST", launch)
            Thread.sleep(5000)
        }
        return isPlaying(context, ip)
    }

    /** Pulsa una tecla del control remoto (Down, Select, Home…). */
    fun key(context: Context, ip: String, key: String) {
        request(context, ip, "POST", "/keypress/$key")
    }

    /** ID de la app en primer plano (o null). */
    fun activeApp(context: Context, ip: String): String? = runCatching {
        Regex("<app[^>]*\\bid=\"([^\"]+)\"").find(request(context, ip, "GET", "/query/active-app"))?.groupValues?.get(1)
    }.getOrNull()

    /** true si el reproductor de la Roku tiene un vídeo cargado (reproduciendo, en pausa o cargando). */
    fun isPlaying(context: Context, ip: String): Boolean = runCatching {
        val state = Regex("<player[^>]*\\bstate=\"([^\"]+)\"").find(request(context, ip, "GET", "/query/media-player"))?.groupValues?.get(1)
        state in setOf("play", "pause", "buffer", "open")
    }.getOrDefault(false)

    /**
     * Reproduce una URL directa (MP4 o HLS) con el reproductor de la Roku, sin la app de YouTube
     * ni sus anuncios. Experimental: depende del modelo de Roku y de que YouTube acepte la URL.
     */
    fun playUrl(context: Context, ip: String, url: String, title: String, hls: Boolean) {
        val format = if (hls) "hls" else "mp4"
        val query = "t=v&u=${enc(url)}&videoName=${enc(title)}&videoFormat=$format"
        try {
            request(context, ip, "POST", "/input/$PLAY_ON_ROKU?$query")
        } catch (e: RokuException) {
            if (e.code != 404) throw e
            request(context, ip, "POST", "/launch/$PLAY_ON_ROKU?$query")
        }
    }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    /** HTTP/1.1 mínimo sobre un socket a la IP local de la Roku. Devuelve el cuerpo. */
    private fun request(context: Context, ip: String, method: String, path: String): String {
        if (!isLocalIpv4(ip)) throw RokuException("Solo se permiten direcciones de la red local")
        Socket().use { s ->
            lan(context)?.bindSocket(s)
            s.connect(InetSocketAddress(ip, PORT), 3000)
            s.soTimeout = 6000
            val head = "$method $path HTTP/1.1\r\nHost: $ip:$PORT\r\nUser-Agent: YTClean\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            s.getOutputStream().apply { write(head.toByteArray(Charsets.UTF_8)); flush() }
            val raw = s.getInputStream().readBytes().toString(Charsets.UTF_8)
            val status = Regex("^HTTP/1\\.[01] (\\d{3})").find(raw)?.groupValues?.get(1)?.toInt() ?: throw RokuException("Respuesta no válida de la Roku")
            if (status !in 200..299) {
                throw RokuException(
                    when (status) {
                        403 -> "La Roku no acepta control desde el teléfono. En la Roku: Configuración → Sistema → Configuración avanzada del sistema → Control por aplicaciones móviles → Acceso a la red: «Predeterminado» o «Permisivo»."
                        404 -> "La Roku no tiene esa aplicación o función (¿está instalada YouTube?)."
                        else -> "La Roku respondió con el error $status"
                    },
                    status,
                )
            }
            val i = raw.indexOf("\r\n\r\n")
            return if (i >= 0) raw.substring(i + 4) else ""
        }
    }

    /** Red Wi-Fi/Ethernet (aunque haya datos móviles activos), o null para la ruta por defecto. */
    @Suppress("DEPRECATION")
    private fun lan(context: Context): Network? {
        val cm = context.applicationContext.getSystemService(ConnectivityManager::class.java) ?: return null
        return cm.allNetworks.firstOrNull { n ->
            cm.getNetworkCapabilities(n)?.let {
                it.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || it.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
            } == true
        }
    }

    /** IPv4 privada (10/8, 172.16/12, 192.168/16) o de enlace local (169.254/16). */
    fun isLocalIpv4(s: String): Boolean {
        val p = s.split('.')
        if (p.size != 4) return false
        val o = p.map { t -> if (t.isEmpty() || t.length > 3 || !t.all(Char::isDigit)) return false else t.toInt() }
        if (o.any { it > 255 }) return false
        return o[0] == 10 || (o[0] == 172 && o[1] in 16..31) || (o[0] == 192 && o[1] == 168) || (o[0] == 169 && o[1] == 254)
    }
}
