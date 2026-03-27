import { atom, map } from 'nanostores';

export const favoritesStore = atom<string[]>([]);
export const isLoadingFavorites = atom<boolean>(false);

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
    const currentFavorites = favoritesStore.get();
    const isFavorite = currentFavorites.includes(productId);

    // Optimistic update
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
            // Revert on failure
            favoritesStore.set(currentFavorites);
            console.error('Failed to update favorite');
        }
    } catch (error) {
        // Revert on error
        favoritesStore.set(currentFavorites);
        console.error('Error toggling favorite:', error);
    }
}
