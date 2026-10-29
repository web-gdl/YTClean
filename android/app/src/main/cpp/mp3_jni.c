/*
 * Puente JNI mínimo hacia LAME: PCM de 16 bits entrelazado -> tramas MP3 CBR.
 * Sin etiqueta ID3 ni cabecera Xing (la etiqueta la escribe Kotlin; en CBR la
 * duración se calcula sin Xing).
 */
#include <jni.h>
#include <stdint.h>
#include "lame.h"

#define JNI_FN(name) Java_com_webgdl_ytclean_download_Mp3Encoder_##name

JNIEXPORT jlong JNICALL JNI_FN(nativeInit)(JNIEnv *env, jclass cls, jint sampleRate, jint channels, jint kbps, jint quality) {
    lame_global_flags *gf = lame_init();
    if (gf == NULL) return 0;
    lame_set_in_samplerate(gf, sampleRate);
    lame_set_num_channels(gf, channels);
    lame_set_mode(gf, channels == 1 ? MONO : JOINT_STEREO);
    lame_set_VBR(gf, vbr_off);
    lame_set_brate(gf, kbps);
    lame_set_quality(gf, quality);
    lame_set_write_id3tag_automatic(gf, 0);
    lame_set_bWriteVbrTag(gf, 0);
    if (lame_init_params(gf) < 0) {
        lame_close(gf);
        return 0;
    }
    return (jlong) (intptr_t) gf;
}

/* pcm: muestras entrelazadas (L,R,L,R… o mono); frames: muestras por canal. */
JNIEXPORT jint JNICALL JNI_FN(nativeEncode)(JNIEnv *env, jclass cls, jlong handle, jshortArray pcm, jint frames, jbyteArray out) {
    lame_global_flags *gf = (lame_global_flags *) (intptr_t) handle;
    if (gf == NULL || frames <= 0) return 0;
    jshort *in = (*env)->GetShortArrayElements(env, pcm, NULL);
    jbyte *dst = (*env)->GetByteArrayElements(env, out, NULL);
    jsize cap = (*env)->GetArrayLength(env, out);
    int n;
    if (lame_get_num_channels(gf) == 1) {
        n = lame_encode_buffer(gf, in, in, frames, (unsigned char *) dst, cap);
    } else {
        n = lame_encode_buffer_interleaved(gf, in, frames, (unsigned char *) dst, cap);
    }
    (*env)->ReleaseShortArrayElements(env, pcm, in, JNI_ABORT);
    (*env)->ReleaseByteArrayElements(env, out, dst, 0);
    return n;
}

JNIEXPORT jint JNICALL JNI_FN(nativeFlush)(JNIEnv *env, jclass cls, jlong handle, jbyteArray out) {
    lame_global_flags *gf = (lame_global_flags *) (intptr_t) handle;
    if (gf == NULL) return 0;
    jbyte *dst = (*env)->GetByteArrayElements(env, out, NULL);
    jsize cap = (*env)->GetArrayLength(env, out);
    int n = lame_encode_flush(gf, (unsigned char *) dst, cap);
    (*env)->ReleaseByteArrayElements(env, out, dst, 0);
    return n;
}

JNIEXPORT void JNICALL JNI_FN(nativeClose)(JNIEnv *env, jclass cls, jlong handle) {
    lame_global_flags *gf = (lame_global_flags *) (intptr_t) handle;
    if (gf != NULL) lame_close(gf);
}
