# Reglas de R8 (reducción de código), basadas en las de NewPipe.
# Sin ofuscar: los fallos siguen siendo legibles; el tamaño se reduce igual.
-dontobfuscate

## NewPipeExtractor
-keep class org.schabi.newpipe.extractor.timeago.patterns.** { *; }

## Rhino (descifrado de firmas de YouTube)
-keep class org.mozilla.javascript.** { *; }
-keep class org.mozilla.classfile.ClassFileWriter
-dontwarn org.mozilla.javascript.JavaToJSONConverters
-dontwarn org.mozilla.javascript.tools.**
-keep class javax.script.** { *; }
-dontwarn javax.script.**
-keep class jdk.dynalink.** { *; }
-dontwarn jdk.dynalink.**

## OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**

## Serializable (StreamInfo y similares)
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    !static !transient <fields>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
}

## Protobuf lite del extractor
-keepclassmembers class * extends com.google.protobuf.GeneratedMessageLite {
    <fields>;
}

## Puente JavaScript del generador de PoToken (WebView)
-keepclassmembers class com.webgdl.ytclean.potoken.** {
    @android.webkit.JavascriptInterface <methods>;
}
