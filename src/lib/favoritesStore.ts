import { atom } from 'nanostores';
import { authClient } from './auth-client';

export const favoritesStore = atom<string[]>([]);
export const isLoadingFavorites = atom<boolean>(false);

async function isAuthenticated(): Promise<boolean> {
    try {
        const { data } = await authClient.getSession();
        return !!data?.user;
    } catch {
        return false;
    }
}

export async function initFavorites() {
    isLoadingFavorites.set(true);
    try {
        const response = await fetch('/api/favorites');
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
                favoritesStore.set(data);
            }
        }
    } catch (error) {
        console.error('Failed to init favorites:', error);
    } finally {
        isLoadingFavorites.set(false);
    }
}

export async function toggleFavorite(productId: string) {
    if (!(await isAuthenticated())) {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
        return;
    }

    const currentFavorites = favoritesStore.get();
    const isFavorite = currentFavorites.includes(productId);

    if (isFavorite) {
        favoritesStore.set(currentFavorites.filter(id => id !== productId));
    } else {
        favoritesStore.set([...currentFavorites, productId]);
    }

    try {
        const method = isFavorite ? 'DELETE' : 'POST';
        const response = await fetch(`/api/favorites/${productId}`, {
            method,
        });

        if (!response.ok) {
            favoritesStore.set(currentFavorites);
            console.error('Failed to update favorite');
        }
    } catch (error) {
        favoritesStore.set(currentFavorites);
        console.error('Error toggling favorite:', error);
    }
}
