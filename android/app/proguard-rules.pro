# Capacitor — الجسر الأصلي للويب فيو (لا يجب تقليصه وإلا تعطّل التطبيق)
-keep class com.getcapacitor.** { *; }

# واجهات JavaScript المُعرّضة داخل WebView
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# WebKit من AndroidX (يستخدمه Capacitor)
-dontwarn androidx.webkit.**

# توافق إضافات Cordova القديمة (غير مستخدمة حاليًا — للاحتياط)
-dontwarn org.apache.cordova.**
