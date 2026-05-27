import "@girs/gjs";
import "@girs/gjs/dom";
import "@girs/gnome-shell/ambient";
import "@girs/gnome-shell/extensions/global";

declare module "gi://Clutter" {
    import Clutter from "@girs/clutter-14";
    export default Clutter;
}

declare module "gi://St" {
    import St from "@girs/st-15";
    export default St;
}

declare module "@girs/clutter-14" {
    export namespace Clutter {
        interface Actor {
            _isDestroyedByGnome?: boolean;
            _weatherDisposed?: boolean;
        }
    }
}

declare module "@girs/st-15" {
    export namespace St {
        interface Widget {
            _isDestroyedByGnome?: boolean;
            _weatherDisposed?: boolean;
        }
    }
}

declare module "resource:///org/gnome/shell/ui/quickSettings.js" {
    export class QuickMenuToggle {
        constructor(params: any);
        _isDestroyedByGnome?: boolean;
        menu: any;
        checked: boolean;
        iconName: string;
        connect(signal: string, callback: Function): number;
        disconnect(id: number): void;
        destroy(): void;
    }
    export class SystemIndicator {
        constructor();
        _isDestroyedByGnome?: boolean;
        quickSettingsItems: any[];
        connect(signal: string, callback: Function): number;
        disconnect(id: number): void;
        destroy(): void;
    }
}
