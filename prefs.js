import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class WeatherEffectPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.weather-effect');

        const page = new Adw.PreferencesPage({
            title: 'Weather Effect Settings',
            icon_name: 'weather-snow-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({});
        page.add(group);

        const typeRow = new Adw.ComboRow({
            title: 'Effect Type',
            subtitle: 'Choose between snow or rain effect',
            model: new Gtk.StringList({ strings: ['Snow', 'Rain'] }),
            selected: settings.get_string('effect-type') === 'snow' ? 0 : 1,
        });
        typeRow.connect('notify::selected', () => {
            settings.set_string('effect-type', typeRow.selected === 0 ? 'snow' : 'rain');
        });
        group.add(typeRow);

        const particleCountRow = new Adw.SpinRow({
            title: 'Particle Count',
            subtitle: 'Number of falling particles (5-50)',
        });
        this._bindNumberRow({
            settings: settings,
            row: particleCountRow,
            key: 'particle-count',
            range: [5, 50, 5],
        });
        group.add(particleCountRow);

        const particleSizeRow = new Adw.SpinRow({
            title: 'Particle Size',
            subtitle: 'Size of falling particles in pixels (4-32)',
        });
        this._bindNumberRow({
            settings: settings,
            row: particleSizeRow,
            key: 'particle-size',
            range: [4, 32, 4],
        });
        group.add(particleSizeRow);

        const speedRow = new Adw.ComboRow({
            title: 'Speed',
            subtitle: 'Speed of falling particles',
            model: new Gtk.StringList({ strings: ['Slow', 'Medium', 'Fast'] }),
            selected: settings.get_int('speed'),
        });
        speedRow.connect('notify::selected', () => {
            settings.set_int('speed', speedRow.selected);
        });
        group.add(speedRow);

        const snowColorRow = new Adw.ComboRow({
            title: 'Snow Color',
            subtitle: 'Color of snow particles',
            model: new Gtk.StringList({ strings: ['White', 'Light Blue', 'Silver'] }),
            selected: ['white', 'lightblue', 'silver'].indexOf(settings.get_string('snow-color')),
        });
        snowColorRow.connect('notify::selected', () => {
            settings.set_string('snow-color', ['white', 'lightblue', 'silver'][snowColorRow.selected]);
        });
        group.add(snowColorRow);

        const snowEmojiRow = new Adw.ComboRow({
            title: 'Snow Emoji',
            subtitle: 'Choose emoji or leave default shape',
            model: new Gtk.StringList({ strings: ['Default', '❄', '❅', '❆'] }),
            selected: ['default', '❄', '❅', '❆'].indexOf(settings.get_string('snow-emoji') || 'default'),
        });
        snowEmojiRow.connect('notify::selected', () => {
            const value = ['default', '❄', '❅', '❆'][snowEmojiRow.selected];
            settings.set_string('snow-emoji', value === 'default' ? '' : value);
        });
        group.add(snowEmojiRow);

        const rainColorRow = new Adw.ComboRow({
            title: 'Rain Color',
            subtitle: 'Color of rain particles',
            model: new Gtk.StringList({ strings: ['Gray', 'Dark Blue'] }),
            selected: ['gray', 'darkblue'].indexOf(settings.get_string('rain-color')),
        });
        rainColorRow.connect('notify::selected', () => {
            settings.set_string('rain-color', ['gray', 'darkblue'][rainColorRow.selected]);
        });
        group.add(rainColorRow);

        const rainEmojiRow = new Adw.ComboRow({
            title: 'Rain Emoji',
            subtitle: 'Choose emoji or leave default shape',
            model: new Gtk.StringList({ strings: ['Default', '💧'] }),
            selected: ['default', '💧'].indexOf(settings.get_string('rain-emoji') || 'default'),
        });
        rainEmojiRow.connect('notify::selected', () => {
            const value = ['default', '💧'][rainEmojiRow.selected];
            settings.set_string('rain-emoji', value === 'default' ? '' : value);
        });
        group.add(rainEmojiRow);
    }

    _bindNumberRow({ settings, row, key, range }) {
        row.adjustment = new Gtk.Adjustment({
            lower: range[0],
            upper: range[1],
            step_increment: range[2],
        });
        row.value = settings.get_int(key);
        row.connect('notify::value', (spin) => {
            const newValue = spin.get_value();
            settings.set_int(key, newValue);
        });
    }
}