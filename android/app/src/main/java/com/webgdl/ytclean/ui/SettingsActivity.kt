package com.webgdl.ytclean.ui

import android.os.Bundle
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.preference.PreferenceFragmentCompat
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.webgdl.ytclean.R
import com.webgdl.ytclean.data.Library
import com.webgdl.ytclean.data.Yt

class SettingsActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            fitsSystemWindows = true
        }
        val toolbar = MaterialToolbar(this).apply {
            title = getString(R.string.settings)
            setNavigationIcon(androidx.appcompat.R.drawable.abc_ic_ab_back_material)
            setNavigationOnClickListener { finish() }
        }
        val container = FrameLayout(this).apply { id = R.id.settings_container }
        root.addView(toolbar)
        root.addView(container)
        setContentView(root)
        if (savedInstanceState == null) {
            supportFragmentManager.beginTransaction().replace(R.id.settings_container, SettingsFragment()).commit()
        }
    }

    override fun onPause() {
        super.onPause()
        Yt.hideShorts = Library(this).hideShorts
    }

    class SettingsFragment : PreferenceFragmentCompat() {
        override fun onResume() {
            super.onResume()
            // Estado actualizado al volver de los ajustes del sistema.
            findPreference<androidx.preference.Preference>("default_links")?.summary =
                when (val st = YoutubeLinks.defaultStatus(requireContext())) {
                    null -> "Al abrir un enlace, elige YT Clean y «Siempre». Toca para ver cómo"
                    else -> if (st.first >= st.second) "Activado: los enlaces de YouTube se abren aquí"
                    else if (st.first == 0) "Desactivado. Toca para activarlo"
                    else "Activado para ${st.first} de ${st.second} dominios. Toca para añadir el resto"
                }
        }

        override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
            preferenceManager.sharedPreferencesName = Library.NAME
            setPreferencesFromResource(R.xml.settings, rootKey)
            findPreference<androidx.preference.ListPreference>("region")?.let { pref ->
                val countries = Yt.supportedCountries()
                val device = Yt.deviceCountry()
                val deviceName = countries.firstOrNull { it.first == device }?.second ?: device
                pref.entries = (listOf("Automático (país del teléfono: $deviceName)") + countries.map { "${it.second} (${it.first})" }).toTypedArray()
                pref.entryValues = (listOf("") + countries.map { it.first }).toTypedArray()
                if (pref.value == null) pref.value = ""
                pref.setOnPreferenceChangeListener { _, value ->
                    Yt.applyRegion(value as String)
                    VideoActions.toast(requireContext(), "Las próximas búsquedas usarán la nueva región")
                    true
                }
            }
            findPreference<androidx.preference.Preference>("default_links")?.setOnPreferenceClickListener {
                MaterialAlertDialogBuilder(requireContext())
                    .setTitle("Abrir enlaces de YouTube")
                    .setMessage(YoutubeLinks.instructions())
                    .setPositiveButton("Ir a los ajustes") { _, _ -> YoutubeLinks.openSettings(requireContext()) }
                    .setNegativeButton("Cancelar", null)
                    .show()
                true
            }
            findPreference<androidx.preference.Preference>("clear_history")?.setOnPreferenceClickListener {
                Library(requireContext()).clearHistory()
                VideoActions.toast(requireContext(), "Historial borrado")
                true
            }
            findPreference<androidx.preference.Preference>("clear_all")?.setOnPreferenceClickListener {
                MaterialAlertDialogBuilder(requireContext())
                    .setMessage("¿Borrar guardados, listas, suscripciones, historial y ajustes? No se puede deshacer.")
                    .setPositiveButton("Borrar todo") { _, _ ->
                        Library(requireContext()).clearAll()
                        VideoActions.toast(requireContext(), "Datos borrados")
                        activity?.recreate()
                    }
                    .setNegativeButton("Cancelar", null)
                    .show()
                true
            }
        }
    }
}
