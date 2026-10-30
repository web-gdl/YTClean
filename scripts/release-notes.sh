#!/usr/bin/env bash
# Notas de una versión publicada en Releases, a partir de la primera sección de CHANGELOG.md.
# Uso: scripts/release-notes.sh <owner/repo> <sha> [tamaño del APK] > notes.md
set -euo pipefail
repo="$1"; sha="$2"; size="${3:-}"
title=$(grep -m1 '^## ' CHANGELOG.md | sed 's/^## //')
echo "**Descarga directa:** [YTClean.apk](https://github.com/$repo/releases/latest/download/YTClean.apk) · Android 7.0 o superior${size:+ · $size}"
echo
echo "## Novedades ($title)"
echo
awk '/^## /{n++} n==1 && !/^## /' CHANGELOG.md | sed '/./,$!d'
echo
echo "## Qué es YT Clean"
echo
echo "Vídeos de YouTube sin anuncios, sin cuenta y sin rastreo: búsqueda, reproductor nativo con segundo plano y controles en la notificación, SponsorBlock, suscripciones locales, listas y cola, subtítulos, descargas de vídeo y audio, **MP3 de vídeos y listas enteras**, apertura de cualquier enlace de YouTube y diseño para autoestéreos (alps 8227L, 1024×600). Historial completo en [CHANGELOG.md](https://github.com/$repo/blob/main/CHANGELOG.md)."
echo
echo "## Instalar o actualizar"
echo
echo "1. Descarga \`YTClean.apk\` en el teléfono y ábrelo (permite «orígenes desconocidos»)."
echo "2. Si la versión instalada se firmó con otra clave, Android no deja actualizar: desinstálala antes (se pierden guardados, listas y suscripciones). Con la clave fija de [docs/android.md](https://github.com/$repo/blob/main/docs/android.md) las versiones se instalan encima."
echo "3. Para abrir siempre los enlaces de YouTube con YT Clean: Ajustes → Enlaces de YouTube."
echo
echo "Compilado automáticamente desde ${sha::7}."
