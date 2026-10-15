import {
  IonPage,
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonSpinner,
  IonToast,
  IonSegment,
  IonSegmentButton,
  IonLabel,
} from '@ionic/react';
import { useEffect, useState } from 'react';
import axios from 'axios';
import '../css/Subscription.css';

const API_BASE_URL = 'https://aarnatechxperts.in/dicomapi/public/api';

interface Plan {
  id: number;
  key: string;
  name: string;
  slug: string;
  tier_name?: string;
  monthly_price: number;
  annual_price: number;
  description?: string;
  badge?: string;
  btn_label?: string;
  features?: [boolean, string][];
}

type BillingCycle = 'monthly' | 'annual';

const formatUSD = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);

const Subscription: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [payingPlanId, setPayingPlanId] = useState<number | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/plans`);
      const data = Array.isArray(res.data) ? res.data : res.data.data ?? [];

      const sorted = [...data].sort(
        (a: Plan, b: Plan) => Number(a.monthly_price) - Number(b.monthly_price)
      );

      setPlans(sorted);
    } catch (err) {
      console.error('Failed to load plans:', err);
      setToastMessage('❌ Failed to load subscription plans.');
      setShowToast(true);
    } finally {
      setLoading(false);
    }
  };

  const handlePayNow = async (planId: number) => {
    const token = localStorage.getItem('token');
    if (!token) {
      setToastMessage('❌ Session expired. Please login again.');
      setShowToast(true);
      return;
    }

    setPayingPlanId(planId);
    try {
      const res = await axios.post(
        `${API_BASE_URL}/create-checkout-session`,
        { plan_id: planId, billing_cycle: billingCycle },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      window.location.href = res.data.url;
    } catch (err) {
      console.error('Checkout session error:', err);
      setToastMessage('❌ Could not start checkout. Please try again.');
      setShowToast(true);
      setPayingPlanId(null);
    }
  };

  const getPrice = (plan: Plan) =>
    billingCycle === 'annual' ? plan.annual_price : plan.monthly_price;

  return (
    <IonPage>
      <IonHeader translucent>
        <IonToolbar className="custom-toolbar">
          <IonTitle className="text-white text-center">
            Choose a Subscription Plan
          </IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen scrollY={true} className="sub-content">
        {/* Fixed background layer — sits behind scrollable content, never blocks scroll */}
        <div className="sub-bg-layer" />

        <div className="sub-scroll-wrap">
          {/* ===== Monthly / Annual Toggle ===== */}
          <div className="billing-toggle-wrap">
            <IonSegment
              value={billingCycle}
              onIonChange={(e) =>
                setBillingCycle(e.detail.value as BillingCycle)
              }
              className="billing-toggle"
            >
              <IonSegmentButton value="monthly">
                <IonLabel>Monthly</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="annual">
                <IonLabel>Annual</IonLabel>
              </IonSegmentButton>
            </IonSegment>
          </div>

          {loading ? (
            <div className="loader-box">
              <IonSpinner name="crescent" />
            </div>
          ) : plans.length === 0 ? (
            <p className="empty-text">No plans available right now.</p>
          ) : (
            <div className="plans-grid">
              {plans.map((plan) => (
                <IonCard
                  key={plan.id}
                  className={`plan-card plan-${plan.slug ?? plan.key}`}
                >
                  {plan.badge && (
                    <div className="plan-badge">{plan.badge}</div>
                  )}

                  <IonCardHeader>
                    {plan.tier_name && (
                      <p className="plan-tier">{plan.tier_name}</p>
                    )}
                    <IonCardTitle>{plan.name}</IonCardTitle>
                  </IonCardHeader>

                  <IonCardContent>
                    <div className="plan-price-row">
                      <span className="plan-price">
                        {formatUSD(getPrice(plan))}
                      </span>
                      <span className="plan-interval">
                        /{billingCycle === 'annual' ? 'year' : 'month'}
                      </span>
                    </div>

                    {billingCycle === 'annual' && (
                      <p className="plan-savings">Billed annually</p>
                    )}

                    {plan.description && (
                      <p className="plan-desc">{plan.description}</p>
                    )}

                    {plan.features && plan.features.length > 0 && (
                      <ul className="plan-features">
                        {plan.features.map(([included, label], i) => (
                          <li
                            key={i}
                            className={included ? 'feature-yes' : 'feature-no'}
                          >
                            {label}
                          </li>
                        ))}
                      </ul>
                    )}

                    <IonButton
                      expand="block"
                      className="pay-now-btn"
                      disabled={payingPlanId === plan.id}
                      onClick={() => handlePayNow(plan.id)}
                    >
                      {payingPlanId === plan.id
                        ? 'Redirecting...'
                        : plan.btn_label || 'Pay Now'}
                    </IonButton>
                  </IonCardContent>
                </IonCard>
              ))}
            </div>
          )}
        </div>

        <IonToast
          isOpen={showToast}
          onDidDismiss={() => setShowToast(false)}
          message={toastMessage}
          duration={2500}
          color="danger"
        />
      </IonContent>
    </IonPage>
  );
};

export default Subscription;