#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class PageCreationTester:
    def __init__(self, base_url="https://rhymepicker.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.test_school_id = "PAGE_TEST"
        self.test_school_name = "Page Creation Test School"
        self.tests_run = 0
        self.tests_passed = 0

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED {details}")
        else:
            print(f"❌ {name} - FAILED {details}")
        return success

    def run_test(self, name, method, endpoint, expected_status, data=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if success:
                try:
                    response_data = response.json() if response.content else {}
                    return self.log_test(name, True, f"{details}"), response_data
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

    def setup_test_school(self):
        """Setup test school"""
        print(f"🏫 Setting up test school: {self.test_school_id}")
        
        success, response = self.run_test(
            "Setup Test School",
            "POST",
            "auth/login",
            200,
            data={
                "school_id": self.test_school_id,
                "school_name": self.test_school_name
            }
        )
        return success

    def clear_existing_selections(self):
        """Clear any existing selections for clean testing"""
        print("🧹 Clearing existing selections...")
        
        # Get current selections
        success, selected = self.run_test(
            "Get Current Selections",
            "GET",
            f"rhymes/selected/{self.test_school_id}",
            200
        )
        
        if success and isinstance(selected, dict) and "nursery" in selected:
            # Remove each selection
            for rhyme in selected["nursery"]:
                page_index = rhyme["page_index"]
                success, _ = self.run_test(
                    f"Clear Selection at Page {page_index}",
                    "DELETE",
                    f"rhymes/remove/{self.test_school_id}/nursery/{page_index}",
                    200
                )

    def test_scenario_1_two_half_page_rhymes(self):
        """Test Scenario 1: Two 0.5 Page Rhymes Should Create Page 2"""
        print("\n🎯 Test Scenario 1: Two 0.5 Page Rhymes Should Create Page 2")
        
        # Get available rhymes
        success, available = self.run_test(
            "Get Available Rhymes",
            "GET",
            f"rhymes/available/{self.test_school_id}/nursery",
            200
        )
        
        if not success or "0.5" not in available or len(available["0.5"]) < 2:
            print("❌ Not enough 0.5 page rhymes available for testing")
            return False
        
        rhyme1 = available["0.5"][0]
        rhyme2 = available["0.5"][1]
        
        print(f"Using rhymes: {rhyme1['code']} and {rhyme2['code']}")
        
        # Step 1: Select first 0.5 page rhyme for TOP position (page_index 0)
        success, _ = self.run_test(
            "Select First 0.5 Page Rhyme (TOP, page_index 0)",
            "POST",
            "rhymes/select",
            200,
            data={
                "school_id": self.test_school_id,
                "grade": "nursery",
                "page_index": 0,
                "rhyme_code": rhyme1["code"]
            }
        )
        
        if not success:
            return False
        
        # Verify selection
        success, selected = self.run_test(
            "Verify First Selection",
            "GET",
            f"rhymes/selected/{self.test_school_id}",
            200
        )
        
        if success and isinstance(selected, dict):
            nursery_selections = selected.get("nursery", [])
            has_first_selection = any(r["code"] == rhyme1["code"] and r["page_index"] == 0 for r in nursery_selections)
            self.log_test("First 0.5 Page Selection Saved", has_first_selection)
        
        # Step 2: Select second 0.5 page rhyme for BOTTOM position (page_index 0)
        success, _ = self.run_test(
            "Select Second 0.5 Page Rhyme (BOTTOM, page_index 0)",
            "POST",
            "rhymes/select",
            200,
            data={
                "school_id": self.test_school_id,
                "grade": "nursery",
                "page_index": 0,
                "rhyme_code": rhyme2["code"]
            }
        )
        
        if not success:
            return False
        
        # Verify both selections are at page_index 0
        success, selected = self.run_test(
            "Verify Both Selections at Page 0",
            "GET",
            f"rhymes/selected/{self.test_school_id}",
            200
        )
        
        if success and isinstance(selected, dict):
            nursery_selections = selected.get("nursery", [])
            page_0_selections = [r for r in nursery_selections if r["page_index"] == 0]
            
            self.log_test("Two Selections at Page 0", len(page_0_selections) == 2, 
                         f"Found {len(page_0_selections)} selections at page 0")
            
            # Check if both rhymes are there
            codes_at_page_0 = [r["code"] for r in page_0_selections]
            has_both_rhymes = rhyme1["code"] in codes_at_page_0 and rhyme2["code"] in codes_at_page_0
            self.log_test("Both Rhymes Present at Page 0", has_both_rhymes,
                         f"Codes at page 0: {codes_at_page_0}")
        
        return True

    def test_scenario_2_one_full_page_rhyme(self):
        """Test Scenario 2: One 1.0 Page Rhyme Should Create Page 2"""
        print("\n🎯 Test Scenario 2: One 1.0 Page Rhyme Should Create Page 2")
        
        # Clear previous selections
        self.clear_existing_selections()
        
        # Get available rhymes
        success, available = self.run_test(
            "Get Available Rhymes for Full Page Test",
            "GET",
            f"rhymes/available/{self.test_school_id}/nursery",
            200
        )
        
        if not success or "1.0" not in available or len(available["1.0"]) < 1:
            print("❌ No 1.0 page rhymes available for testing")
            return False
        
        # Look for RE00077 - Fruits salad specifically
        full_page_rhyme = None
        for rhyme in available["1.0"]:
            if rhyme["code"] == "RE00077":
                full_page_rhyme = rhyme
                break
        
        if not full_page_rhyme:
            full_page_rhyme = available["1.0"][0]  # Use first available
        
        print(f"Using 1.0 page rhyme: {full_page_rhyme['code']} - {full_page_rhyme['name']}")
        
        # Select 1.0 page rhyme for TOP position (page_index 0)
        success, _ = self.run_test(
            "Select 1.0 Page Rhyme (TOP, page_index 0)",
            "POST",
            "rhymes/select",
            200,
            data={
                "school_id": self.test_school_id,
                "grade": "nursery",
                "page_index": 0,
                "rhyme_code": full_page_rhyme["code"]
            }
        )
        
        if not success:
            return False
        
        # Verify selection
        success, selected = self.run_test(
            "Verify 1.0 Page Selection",
            "GET",
            f"rhymes/selected/{self.test_school_id}",
            200
        )
        
        if success and isinstance(selected, dict):
            nursery_selections = selected.get("nursery", [])
            has_full_page_selection = any(
                r["code"] == full_page_rhyme["code"] and 
                r["page_index"] == 0 and 
                r["pages"] == 1.0 
                for r in nursery_selections
            )
            self.log_test("1.0 Page Selection Saved", has_full_page_selection)
            
            # Check that only one selection exists at page 0 (since 1.0 page fills entire page)
            page_0_selections = [r for r in nursery_selections if r["page_index"] == 0]
            self.log_test("Only One Selection at Page 0 (Full Page)", len(page_0_selections) == 1,
                         f"Found {len(page_0_selections)} selections at page 0")
        
        return True

    def test_page_indexing_logic(self):
        """Test the page indexing logic specifically"""
        print("\n🔢 Testing Page Indexing Logic")
        
        # Clear previous selections
        self.clear_existing_selections()
        
        # Get available rhymes
        success, available = self.run_test(
            "Get Available Rhymes for Indexing Test",
            "GET",
            f"rhymes/available/{self.test_school_id}/nursery",
            200
        )
        
        if not success:
            return False
        
        # Test multiple page indices
        test_selections = []
        
        # Add selection at page_index 0
        if "0.5" in available and len(available["0.5"]) > 0:
            rhyme = available["0.5"][0]
            success, _ = self.run_test(
                "Select Rhyme at Page Index 0",
                "POST",
                "rhymes/select",
                200,
                data={
                    "school_id": self.test_school_id,
                    "grade": "nursery",
                    "page_index": 0,
                    "rhyme_code": rhyme["code"]
                }
            )
            if success:
                test_selections.append((0, rhyme["code"]))
        
        # Add selection at page_index 2 (skip 1 to test non-sequential)
        if "0.5" in available and len(available["0.5"]) > 1:
            rhyme = available["0.5"][1]
            success, _ = self.run_test(
                "Select Rhyme at Page Index 2",
                "POST",
                "rhymes/select",
                200,
                data={
                    "school_id": self.test_school_id,
                    "grade": "nursery",
                    "page_index": 2,
                    "rhyme_code": rhyme["code"]
                }
            )
            if success:
                test_selections.append((2, rhyme["code"]))
        
        # Add selection at page_index 1 (fill the gap)
        if "1.0" in available and len(available["1.0"]) > 0:
            rhyme = available["1.0"][0]
            success, _ = self.run_test(
                "Select Rhyme at Page Index 1",
                "POST",
                "rhymes/select",
                200,
                data={
                    "school_id": self.test_school_id,
                    "grade": "nursery",
                    "page_index": 1,
                    "rhyme_code": rhyme["code"]
                }
            )
            if success:
                test_selections.append((1, rhyme["code"]))
        
        # Verify all selections are saved with correct page indices
        success, selected = self.run_test(
            "Verify Multiple Page Index Selections",
            "GET",
            f"rhymes/selected/{self.test_school_id}",
            200
        )
        
        if success and isinstance(selected, dict):
            nursery_selections = selected.get("nursery", [])
            
            # Check each test selection
            for expected_page_index, expected_code in test_selections:
                found = any(
                    r["code"] == expected_code and r["page_index"] == expected_page_index
                    for r in nursery_selections
                )
                self.log_test(f"Selection at Page Index {expected_page_index}", found,
                             f"Code: {expected_code}")
            
            # Check that selections are sorted by page_index
            page_indices = [r["page_index"] for r in nursery_selections]
            is_sorted = page_indices == sorted(page_indices)
            self.log_test("Selections Sorted by Page Index", is_sorted,
                         f"Page indices: {page_indices}")
        
        return True

    def run_all_tests(self):
        """Run all page creation tests"""
        print("🚀 Starting Page Creation Logic Tests...")
        print(f"Testing against: {self.base_url}")
        
        # Setup
        if not self.setup_test_school():
            print("❌ Failed to setup test school")
            return False
        
        # Clear any existing data
        self.clear_existing_selections()
        
        # Run test scenarios
        self.test_scenario_1_two_half_page_rhymes()
        self.test_scenario_2_one_full_page_rhyme()
        self.test_page_indexing_logic()
        
        # Print summary
        print(f"\n📊 Page Creation Test Summary:")
        print(f"Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        return self.tests_passed == self.tests_run

def main():
    tester = PageCreationTester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())