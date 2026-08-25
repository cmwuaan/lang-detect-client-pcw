export interface PlatformDetail {
	name: string;
	value: string;
}

export interface PlatformInfo {
	/** Nhãn ngắn hiển thị trên UI. */
	label: string;
	details: PlatformDetail[];
}

export interface IPlatformService {
	readonly isDesktop: boolean;
	getInfo(): Promise<PlatformInfo>;
}
