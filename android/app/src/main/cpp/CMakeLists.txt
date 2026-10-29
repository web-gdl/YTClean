# Codificador MP3 (LAME 3.100) + puente JNI para convertir audio a MP3 en el teléfono.
cmake_minimum_required(VERSION 3.22.1)
project(ytclean_mp3 C)

file(GLOB LAME_SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/lame/libmp3lame/*.c)
add_library(ytclean_mp3 SHARED mp3_jni.c ${LAME_SOURCES})
target_include_directories(ytclean_mp3 PRIVATE lame/include lame/libmp3lame)
# Sin config.h: lo mínimo que LAME necesita en Android (como en sus compilaciones para NDK).
target_compile_definitions(ytclean_mp3 PRIVATE STDC_HEADERS HAVE_STDINT_H HAVE_LIMITS_H ieee754_float32_t=float)
target_compile_options(ytclean_mp3 PRIVATE -O2 -fvisibility=hidden -ffunction-sections -fdata-sections -w)
target_link_options(ytclean_mp3 PRIVATE -Wl,--gc-sections -Wl,--exclude-libs,ALL -Wl,-z,max-page-size=16384)
target_link_libraries(ytclean_mp3 m)
