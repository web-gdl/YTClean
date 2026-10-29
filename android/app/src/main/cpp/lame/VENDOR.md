# LAME 3.100 (libmp3lame)

Codificador MP3 de referencia, LGPL-2.0-or-later (ver `COPYING`). Copia sin modificar de
`libmp3lame/*.c|h` e `include/lame.h` de https://github.com/lameproject/lame
(commit 1f5cc9487284d5950343aa5d4f70de433468070a). Se omiten el decodificador (mpglib),
el frontend, el código específico de x86 (`i386/` y `vector/`, salvo la cabecera `vector/lame_intrin.h`) y los archivos de autotools.
Se compila con `../CMakeLists.txt`.
