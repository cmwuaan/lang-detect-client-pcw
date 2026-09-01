import type * as Zlang from './zlang';

declare const nativeLibs: {
	zlang: () => typeof Zlang;
};

export = nativeLibs;
