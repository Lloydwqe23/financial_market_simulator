import { create } from 'zustand';

export const useReviewStore = create((set) => ({
    reviews: [
        {
            id: 'mock-1',
            userEmail: 'faculty.reviewer@ucu.edu.ua',
            rating: 3,
            text: 'its meh',
            date: new Date(Date.now() - 86400000 * 2).toLocaleDateString()
        },
        {
            id: 'mock-2',
            userEmail: 'senior.analyst@wallstreet.com',
            rating: 5,
            text: 'its good',
            date: new Date(Date.now() - 86400000).toLocaleDateString()
        }
    ],
    addReview: (review) => set((state) => ({
        reviews: [review, ...state.reviews]
    })),
    deleteReview: (id) => set((state) => ({
        reviews: state.reviews.filter(r => r.id !== id)
    }))
}));