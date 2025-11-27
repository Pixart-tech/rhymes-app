#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class RhymePickerAPITester:
    def __init__(self, base_url="https://rhymepicker.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.school_data = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_school_id = "TEST_DUAL"
        self.test_school_name = "Dual Container Test"

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED {details}")
        else:
            print(f"❌ {name} - FAILED {details}")
        return success

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        if headers is None:
            headers = {'Content-Type': 'application/json'}

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)
            else:
                return self.log_test(name, False, f"Unsupported method: {method}")

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if success:
                try:
                    response_data = response.json() if response.content else {}
                    return self.log_test(name, True, f"{details}, Response: {type(response_data).__name__}"), response_data
                except:
                    return self.log_test(name, True, f"{details}, Response: Non-JSON"), response.text
            else:
                try:
                    error_data = response.json() if response.content else {}
                    return self.log_test(name, False, f"{details}, Error: {error_data}"), {}
                except:
                    return self.log_test(name, False, f"{details}, Error: {response.text[:100]}"), {}

        except requests.exceptions.RequestException as e:
            return self.log_test(name, False, f"Network Error: {str(e)}"), {}

    def test_authentication(self):
        """Test authentication endpoint"""
        print("\n🔐 Testing Authentication...")
        
        success, response = self.run_test(
            "School Login",
            "POST",
            "auth/login",
            200,
            data={
                "school_id": self.test_school_id,
                "school_name": self.test_school_name
            }
        )
        
        if success and isinstance(response, dict):
            self.school_data = response
            required_fields = ['id', 'school_id', 'school_name', 'timestamp']
            missing_fields = [field for field in required_fields if field not in response]
            if missing_fields:
                self.log_test("School Login Response Structure", False, f"Missing fields: {missing_fields}")
            else:
                self.log_test("School Login Response Structure", True, "All required fields present")
        
        return success

    def test_rhymes_endpoints(self):
        """Test rhyme data endpoints"""
        print("\n🎵 Testing Rhyme Data Endpoints...")
        
        # Test get all rhymes
        success, all_rhymes = self.run_test(
            "Get All Rhymes",
            "GET",
            "rhymes",
            200
        )
        
        if success and isinstance(all_rhymes, dict):
            # Check if we have both 0.5 and 1.0 page rhymes
            has_half_page = "0.5" in all_rhymes
            has_full_page = "1.0" in all_rhymes
            
            self.log_test("Rhymes Data Structure - 0.5 pages", has_half_page)
            self.log_test("Rhymes Data Structure - 1.0 pages", has_full_page)
            
            if has_half_page:
                sample_rhyme = all_rhymes["0.5"][0] if all_rhymes["0.5"] else None
                if sample_rhyme:
                    required_fields = ['code', 'name', 'pages', 'personalized']
                    missing_fields = [field for field in required_fields if field not in sample_rhyme]
                    self.log_test("Rhyme Object Structure", len(missing_fields) == 0, 
                                f"Missing: {missing_fields}" if missing_fields else "All fields present")

        # Test get available rhymes for a grade
        success, available_rhymes = self.run_test(
            "Get Available Rhymes for Grade",
            "GET",
            f"rhymes/available/{self.test_school_id}/nursery",
            200
        )
        
        # Test get selected rhymes (should be empty initially)
        success, selected_rhymes = self.run_test(
            "Get Selected Rhymes",
            "GET",
            f"rhymes/selected/{self.test_school_id}",
            200
        )

    def test_rhyme_selection_workflow(self):
        """Test complete rhyme selection workflow for dual-container system"""
        print("\n🎯 Testing Dual-Container Rhyme Selection Workflow...")
        
        # First, get available rhymes to select from
        success, available_rhymes = self.run_test(
            "Get Available Rhymes for Selection",
            "GET",
            f"rhymes/available/{self.test_school_id}/nursery",
            200
        )
        
        if not success or not isinstance(available_rhymes, dict):
            print("❌ Cannot proceed with selection tests - no available rhymes")
            return False
        
        # Find a 0.5 page rhyme for testing
        half_page_rhyme = None
        if "0.5" in available_rhymes and available_rhymes["0.5"]:
            half_page_rhyme = available_rhymes["0.5"][0]
        
        # Find a 1.0 page rhyme for testing (specifically RE00077 - Fruits salad if available)
        full_page_rhyme = None
        if "1.0" in available_rhymes and available_rhymes["1.0"]:
            # Look for RE00077 specifically
            for rhyme in available_rhymes["1.0"]:
                if rhyme["code"] == "RE00077":
                    full_page_rhyme = rhyme
                    break
            # If RE00077 not found, use first available 1.0 page rhyme
            if not full_page_rhyme:
                full_page_rhyme = available_rhymes["1.0"][0]
        
        # Test selecting a 0.5 page rhyme at page_index 0
        if half_page_rhyme:
            success, response = self.run_test(
                "Select 0.5 Page Rhyme (page_index 0)",
                "POST",
                "rhymes/select",
                200,
                data={
                    "school_id": self.test_school_id,
                    "grade": "nursery",
                    "page_index": 0,
                    "rhyme_code": half_page_rhyme["code"]
                }
            )
            
            if success:
                # Verify the selection was saved
                success, selected = self.run_test(
                    "Verify 0.5 Page Selection Saved",
                    "GET",
                    f"rhymes/selected/{self.test_school_id}",
                    200
                )
                
                if success and isinstance(selected, dict):
                    has_nursery = "nursery" in selected
                    has_selection = has_nursery and len(selected["nursery"]) > 0
                    self.log_test("0.5 Page Selection Verified", has_selection)
        
        # Test selecting a 1.0 page rhyme at page_index 1
        if full_page_rhyme:
            success, response = self.run_test(
                "Select 1.0 Page Rhyme (page_index 1)",
                "POST",
                "rhymes/select",
                200,
                data={
                    "school_id": self.test_school_id,
                    "grade": "nursery",
                    "page_index": 1,
                    "rhyme_code": full_page_rhyme["code"]
                }
            )
            
            if success:
                # Verify the selection was saved
                success, selected = self.run_test(
                    "Verify 1.0 Page Selection Saved",
                    "GET",
                    f"rhymes/selected/{self.test_school_id}",
                    200
                )
        
        # Test replacing a selection (select different rhyme at same page_index)
        if half_page_rhyme and "0.5" in available_rhymes and len(available_rhymes["0.5"]) > 1:
            replacement_rhyme = available_rhymes["0.5"][1]
            success, response = self.run_test(
                "Replace Rhyme Selection",
                "POST",
                "rhymes/select",
                200,
                data={
                    "school_id": self.test_school_id,
                    "grade": "nursery",
                    "page_index": 0,
                    "rhyme_code": replacement_rhyme["code"]
                }
            )
        
        # Test removing a selection
        success, response = self.run_test(
            "Remove Rhyme Selection",
            "DELETE",
            f"rhymes/remove/{self.test_school_id}/nursery/0",
            200
        )
        
        return True

    def test_svg_generation(self):
        """Test SVG generation endpoint"""
        print("\n🎨 Testing SVG Generation...")
        
        # Test with a known rhyme code (try RE00077 first, then fallback)
        test_codes = ["RE00077", "RE00001"]
        svg_tested = False
        
        for code in test_codes:
            success, svg_content = self.run_test(
                f"Generate SVG for {code}",
                "GET",
                f"rhymes/svg/{code}",
                200
            )

            if success and isinstance(svg_content, dict):
                pages = svg_content.get("pages") or []
                first_page = pages[0] if pages else ''
                is_svg = isinstance(first_page, str) and first_page.strip().startswith('<svg')
                self.log_test("SVG Content Format", is_svg, "Valid SVG format" if is_svg else "Invalid SVG format")
                svg_tested = True
                break
        
        if not svg_tested:
            self.log_test("SVG Generation", False, "No valid rhyme codes found for testing")
        
        # Test with invalid rhyme code
        success, response = self.run_test(
            "SVG for Invalid Rhyme Code",
            "GET",
            "rhymes/svg/INVALID",
            404
        )

    def test_grade_status(self):
        """Test grade status endpoint"""
        print("\n📊 Testing Grade Status...")
        
        success, status = self.run_test(
            "Get Grade Status",
            "GET",
            f"rhymes/status/{self.test_school_id}",
            200
        )
        
        if success and isinstance(status, list):
            expected_grades = ["nursery", "lkg", "ukg", "playgroup"]
            found_grades = [grade_info["grade"] for grade_info in status if "grade" in grade_info]
            
            all_grades_present = all(grade in found_grades for grade in expected_grades)
            self.log_test("All Grades Present in Status", all_grades_present, 
                        f"Found: {found_grades}, Expected: {expected_grades}")
            
            # Check status structure
            if status:
                sample_status = status[0]
                required_fields = ["grade", "selected_count", "total_available"]
                missing_fields = [field for field in required_fields if field not in sample_status]
                self.log_test("Grade Status Structure", len(missing_fields) == 0,
                            f"Missing: {missing_fields}" if missing_fields else "All fields present")

    def test_error_handling(self):
        """Test error handling scenarios"""
        print("\n⚠️ Testing Error Handling...")
        
        # Test selecting non-existent rhyme
        success, response = self.run_test(
            "Select Non-existent Rhyme",
            "POST",
            "rhymes/select",
            404,
            data={
                "school_id": self.test_school_id,
                "grade": "nursery",
                "page_index": 0,
                "rhyme_code": "NONEXISTENT"
            }
        )
        
        # Test removing non-existent selection
        success, response = self.run_test(
            "Remove Non-existent Selection",
            "DELETE",
            f"rhymes/remove/{self.test_school_id}/nursery/999",
            404
        )

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting Rhyme Picker API Tests...")
        print(f"Testing against: {self.base_url}")
        
        # Test authentication first
        if not self.test_authentication():
            print("❌ Authentication failed - stopping tests")
            return False
        
        # Run all other tests
        self.test_rhymes_endpoints()
        self.test_rhyme_selection_workflow()
        self.test_svg_generation()
        self.test_grade_status()
        self.test_error_handling()
        
        # Print summary
        print(f"\n📊 Test Summary:")
        print(f"Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        return self.tests_passed == self.tests_run

def main():
    tester = RhymePickerAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())