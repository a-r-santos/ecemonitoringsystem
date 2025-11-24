import React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import '../CSS/Student.css';
import logo from '../Images/logo.png';

function Student() {
  const { register, handleSubmit } = useForm();
  const navigate = useNavigate();

  const onSubmit = (data) => {
    // Pass full student data object to instructors list page
    navigate('/instructors-list', { state: { student: data } });
  };

  // Function to allow only numeric input (0-9)
  const numericOnly = (event) => {
    const charCode = event.which ? event.which : event.keyCode;
    // Check if the pressed key is NOT a digit (0-9)
    if (charCode > 31 && (charCode < 48 || charCode > 57)) {
      event.preventDefault();
    }
  };

  return (
    <div className="Student">
      <header className="App-header1">
        <img src={logo} className="App-logo1" alt="logo" />
      </header>

      <div className="student-container">
        <div className="header-text">
          <h1>Welcome, Student!</h1>
          <p>Please Input your Details for the Reservation of your Appointment</p>
        </div>

        <form className="student-form" onSubmit={handleSubmit(onSubmit)}>

          <div className="form-group">
            <label htmlFor="student_id">Student ID Number</label>
            <input
              {...register("student_id", { required: true, pattern: /^\d+$/ })}
              type="text"
              id="student_id"
              name="student_id" // MATCHES SUPABASE COLUMN
              placeholder="Student ID Number"
              pattern="[0-9]*"
              onKeyPress={numericOnly}
            />
          </div>

          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input
              {...register("name", { required: true })}
              type="text"
              id="name"
              name="name"
              placeholder="Full Name"
            />
          </div>

          {/* Year Level Dropdown */}
          <div className="form-group">
            <label htmlFor="yearLevel">Year Level</label>
            <select
              {...register("yearLevel", { required: true })}
              id="yearLevel"
              name="yearLevel"
            >
              <option value="">Select Year Level</option>
              <option value="1st Year">1st Year</option>
              <option value="2nd Year">2nd Year</option>
              <option value="3rd Year">3rd Year</option>
              <option value="4th Year">4th Year</option>
              <option value="5th Year">5th Year</option>
              <option value="Irregular">Irregular</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="program">Program</label>
            <input
              {...register("program", { required: true })}
              type="text"
              id="program"
              name="program"
              placeholder="Program (e.g., BSECE)"
            />
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              {...register("email", { required: true })}
              type="email"
              id="email"
              name="email"
              placeholder="Email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="mobile_number">Mobile Number</label>
            <input
              {...register("mobile_number", { required: true })}
              type="tel"
              id="mobile_number"
              name="mobile_number" // MATCHES SUPABASE COLUMN
              placeholder="Mobile Number"
              onKeyPress={numericOnly}
            />
          </div>

          <button type="submit">Submit</button>
        </form>
      </div>
    </div>
  );
}

export default Student;