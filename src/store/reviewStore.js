import { create } from 'zustand';

export const useReviewStore = create((set) => ({
    reviews: [],
    isLoading: false,

    fetchReviews: async () => {
        set({ isLoading: true });
        try {
            const response = await fetch('/api/reviews');
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            set({ reviews: data, isLoading: false });
        } catch (error) {
            console.error("Failed to fetch reviews from database:", error);
            set({ isLoading: false });
        }
    },

    addReview: async (review) => {
        try {
            const response = await fetch('/api/reviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(review)
            });

            if (response.ok) {
                set((state) => ({ reviews: [review, ...state.reviews] }));
            }
        } catch (error) {
            console.error("Failed to post review to database:", error);
        }
    },

    deleteReview: async (id) => {
        try {
            const response = await fetch(`/api/reviews/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                set((state) => ({ reviews: state.reviews.filter(r => r.id !== id) }));
            }
        } catch (error) {
            console.error("Failed to delete review from database:", error);
        }
    }
}));