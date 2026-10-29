package com.webgdl.ytclean.download

/** Codificador MP3 nativo (LAME 3.100, `src/main/cpp`). PCM de 16 bits entrelazado → tramas MP3 CBR. */
object Mp3Encoder {
    init {
        System.loadLibrary("ytclean_mp3")
    }

    /** Devuelve un identificador del codificador, o 0 si los parámetros no son válidos. */
    @JvmStatic external fun nativeInit(sampleRate: Int, channels: Int, kbps: Int, quality: Int): Long

    /** Codifica [frames] muestras por canal; devuelve los bytes escritos en [out] (negativo = error). */
    @JvmStatic external fun nativeEncode(handle: Long, pcm: ShortArray, frames: Int, out: ByteArray): Int

    @JvmStatic external fun nativeFlush(handle: Long, out: ByteArray): Int

    @JvmStatic external fun nativeClose(handle: Long)

    /** Tamaño de salida recomendado por LAME para [frames] muestras por canal. */
    fun outputSize(frames: Int): Int = (1.25 * frames).toInt() + 7200
}
