import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import { WeatherEffectController } from "./lib/WeatherEffectController.js";
export default class WeatherEffectExtension extends Extension {
    _controller = null;
    enable() {
        this._controller = new WeatherEffectController(this.getSettings());
        this._controller.enable();
    }
    disable() {
        this._controller?.disable();
        this._controller = null;
    }
}
