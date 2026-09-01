package com.mubeyworks.nextmusic

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * HD（车机/TV）专属：开机自启——车机点火/电视上电即进播放器。
 * 仅存在于 hd flavor 源集，手机 phone 包不受影响。
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val i = Intent(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
        }
    }
}
