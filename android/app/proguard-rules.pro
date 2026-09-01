# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# ---- NextMusic: lib→app 反射入口（react-native-audio-pro 补丁经 Class.forName/getMethod 调用）----
# R8 改名任何一个都会让 sink 登记/音效 DSP 静默失效（2026-09-01 V40 实锤：attachSink 被改名，
# 设备切换/抢路由哨兵全灭 —— "no sink attached"）
-keep class com.mubeyworks.nextmusic.AudioRouteEngine { *; }
-keep class com.mubeyworks.nextmusic.SoundFxEngine { *; }
