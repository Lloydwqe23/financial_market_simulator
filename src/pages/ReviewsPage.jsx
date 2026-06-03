import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useReviewStore } from '../store/reviewStore';

function ReviewsPage() {
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);

    const reviews = useReviewStore((s) => s.reviews);
    const addReview = useReviewStore((s) => s.addReview);
    const deleteReview = useReviewStore((s) => s.deleteReview);

    const [isWriting, setIsWriting] = useState(false);
    const [rating, setRating] = useState(5);
    const [hoverRating, setHoverRating] = useState(0);
    const [comment, setComment] = useState('');

    const userReview = user ? reviews.find((r) => r.userEmail === user.email) : null;
    const displayReviews = user ? reviews.filter((r) => r.userEmail !== user.email) : reviews;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!user || !comment.trim()) return;

        addReview({
            id: crypto.randomUUID(),
            userEmail: user.email,
            rating,
            text: comment.trim(),
            date: new Date().toLocaleDateString()
        });

        setIsWriting(false);
        setComment('');
        setRating(5);
        setHoverRating(0);
    };

    const renderStaticStars = (score) => (
        <div style={{ display: 'flex', gap: '2px' }}>
            {[1, 2, 3, 4, 5].map(star => (
                <span key={star} style={{ color: star <= score ? '#eab308' : 'rgba(255, 255, 255, 0.15)', fontSize: '1.2rem', lineHeight: 1 }}>
                    ★
                </span>
            ))}
        </div>
    );

    return (
        <section style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="surface" style={{ width: '100%', maxWidth: '800px', boxSizing: 'border-box' }}>

                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '32px' }}>
                    <button type="button" className="ghost-button" onClick={() => navigate(-1)} style={{ margin: 0 }}>
                        ← Back
                    </button>
                    <h2 style={{ margin: 0 }}>Platform Reviews</h2>
                </div>

                {!user ? (
                    <div className="helper-box" style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={{ margin: 0 }}>Sign in to leave a review and rate the Market Simulator.</p>
                        <button type="button" className="primary-button" onClick={() => navigate('/login')} style={{ margin: 0, padding: '6px 16px' }}>
                            Sign In
                        </button>
                    </div>
                ) : userReview ? (
                    <div style={{ marginBottom: '32px' }}>
                        <h3 style={{ color: 'var(--accent)', marginBottom: '16px' }}>Your Review</h3>
                        <div className="list-item" style={{ flexDirection: 'column', alignItems: 'flex-start', borderLeft: '3px solid var(--accent)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    {renderStaticStars(userReview.rating)}
                                    <strong>{userReview.userEmail}</strong>
                                </div>
                                <small className="asset-meta">{userReview.date}</small>
                            </div>
                            <p style={{ margin: '12px 0 0 0', lineHeight: '1.5', color: 'var(--text)' }}>
                                "{userReview.text}"
                            </p>
                            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                                <button
                                    type="button"
                                    className="ghost-button"
                                    style={{ color: 'var(--danger)', margin: 0, padding: '6px 12px', fontSize: '0.8rem' }}
                                    onClick={() => deleteReview(userReview.id)}
                                >
                                    Delete Review
                                </button>
                            </div>
                        </div>
                    </div>
                ) : isWriting ? (
                    <form className="helper-box" style={{ marginBottom: '32px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'rgba(255,255,255,0.02)' }} onSubmit={handleSubmit}>
                        <h3 style={{ margin: 0 }}>Write a Review</h3>

                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--muted)' }}>Rating</label>
                            <div style={{ display: 'flex', gap: '4px', flexDirection: 'row' }}>
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                        key={star}
                                        type="button"
                                        onClick={() => setRating(star)}
                                        onMouseEnter={() => setHoverRating(star)}
                                        onMouseLeave={() => setHoverRating(0)}
                                        style={{
                                            background: 'transparent', border: 0, fontSize: '2.2rem', cursor: 'pointer', padding: 0,
                                            color: star <= (hoverRating || rating) ? '#eab308' : 'rgba(255,255,255,0.15)',
                                            transition: 'color 0.1s ease-in-out'
                                        }}
                                    >
                                        ★
                                    </button>
                                ))}
                            </div>
                        </div>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--muted)' }}>
                            Your Comment
                            <textarea
                                className="market-search-input"
                                style={{ resize: 'vertical', minHeight: '100px', padding: '12px', lineHeight: '1.5' }}
                                placeholder="What do you think of the simulator?"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                required
                            />
                        </label>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                            <button type="button" className="ghost-button" onClick={() => setIsWriting(false)}>Cancel</button>
                            <button type="submit" className="primary-button" disabled={!comment.trim()}>Post Review</button>
                        </div>
                    </form>
                ) : (
                    <div style={{ marginBottom: '32px' }}>
                        <button type="button" className="primary-button" onClick={() => setIsWriting(true)}>
                            + Add a Review
                        </button>
                    </div>
                )}

                <h3 style={{ marginBottom: '16px' }}>Community Reviews ({displayReviews.length})</h3>
                {displayReviews.length === 0 ? (
                    <div className="empty-state">No other reviews yet.</div>
                ) : (
                    <div className="section-list">
                        {displayReviews.map((r) => (
                            <div className="list-item" key={r.id} style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {renderStaticStars(r.rating)}
                                        <strong>{r.userEmail}</strong>
                                    </div>
                                    <small className="asset-meta">{r.date}</small>
                                </div>
                                <p style={{ margin: '12px 0 0 0', lineHeight: '1.5', color: 'var(--muted)' }}>
                                    "{r.text}"
                                </p>
                            </div>
                        ))}
                    </div>
                )}

            </div>
        </section>
    );
}

export default ReviewsPage;