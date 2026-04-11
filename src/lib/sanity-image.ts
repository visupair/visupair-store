/// <reference types="@sanity/astro/module" />
import { createImageUrlBuilder } from '@sanity/image-url';
import { sanityClient } from "sanity:client";

const builder = createImageUrlBuilder(sanityClient);

export function urlFor(source: any) {
    return builder.image(source).quality(75).auto('format');
}

/**
 * Main gallery column on portfolio / product detail (sharper than grid cards).
 * Wider + higher quality than default urlFor for retina displays.
 */
export function urlForDetailGalleryPreview(source: any): string {
    if (source == null) return '';
    const w = 1680;
    const q = 90;
    if (typeof source === 'string') {
        if (!source.startsWith('http')) return '';
        return builder.image(source).width(w).quality(q).auto('format').url();
    }
    return builder.image(source).width(w).quality(q).auto('format').url();
}

/** Lightbox / fullscreen: original pixel dimensions (no w/h cap), higher quality. */
export function urlForFullscreen(source: any): string {
    if (source == null) return '';
    if (typeof source === 'string') {
        return source.startsWith('http') ? source : '';
    }
    return builder.image(source).quality(100).auto('format').url();
}
