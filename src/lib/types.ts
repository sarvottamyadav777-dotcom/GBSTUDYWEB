export interface AppItem {
  id: string;
  name: string;
  label: string;
  description: string;
  logo_url: string | null;
  app_url: string | null;
  app_url_2: string | null;
  app_url_3: string | null;
  app_url_4: string | null;
  tone: string;
  sort_order: number;
  vip_text: string;
  open_text: string;
  is_active: boolean;
  created_at: string;
}

export interface SliderPhoto {
  id: string;
  image_data: string;
  sort_order: number;
  created_at: string;
}

export type SocialPlatform = 'telegram' | 'youtube' | 'whatsapp' | 'instagram';

export type SocialLinksMap = Partial<Record<SocialPlatform, string>>;
