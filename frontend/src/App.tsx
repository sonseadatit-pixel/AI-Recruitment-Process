import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import JobEdit from './pages/JobEdit';
import Candidates from './pages/Candidates';
import Screening from './pages/Screening';
import Interviews from './pages/Interviews';
import Recommendations from './pages/Recommendations';
import CandidateProfile from './pages/CandidateProfile';
import InterviewQuestions from './pages/InterviewQuestions';
import InterviewEvaluation from './pages/InterviewEvaluation';
import FinalRecommendation from './pages/FinalRecommendation';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="/jobs/:id/edit" element={<JobEdit />} />
        <Route path="/candidates" element={<Candidates />} />
        <Route path="/screening" element={<Screening />} />
        <Route path="/interviews" element={<Interviews />} />
        <Route path="/recommendations" element={<Recommendations />} />
        <Route path="/candidates/:id" element={<CandidateProfile />} />
        <Route path="/candidates/:id/interview-questions" element={<InterviewQuestions />} />
        <Route path="/candidates/:id/interview-evaluation" element={<InterviewEvaluation />} />
        <Route path="/candidates/:id/recommendation" element={<FinalRecommendation />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
