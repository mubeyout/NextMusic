package com.mubeyworks.nextmusic

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class MusicScannerPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(MusicScannerModule(reactContext), DownloaderModule(reactContext), VersionModule(reactContext), SoundFxModule(reactContext), RestartModule(reactContext), ReloadModule(reactContext), BlurModule(reactContext), AudioRouteModule(reactContext), DlnaModule(reactContext), CastModule(reactContext), VisualizerModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
